import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { db } from './db.server';

// Define types
type CleanedRecord = Record<string, unknown>;

/**
 * Normalize a field name by trimming, converting to lowercase,
 * replacing spaces with underscores, and removing non-alphanumeric characters.
 */
function normalizeFieldName(fieldName: string): string {
  return fieldName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

// Map file headers to database fields
const FIELD_MAPPING: Record<string, string> = {
  'practice_name': 'practiceName',
  'charge': 'charge',
  'cpt_code': 'cptCode',
  'revenue_code': 'revenueCode',
  'loc': 'levelOfCare',
  'charge_amount': 'chargeAmount',
  'payment': 'payment',
  'allowed_amount': 'allowedAmount',
  'primary_group': 'primaryGroup',
  'claim_primary_member_id': 'claimPrimaryID',
  'payer_name': 'payerName',
  'payer_group': 'payerGroup',
  'payment_total_paid': 'paymentTotal',
  'payment_received': 'paymentReceived',
  'payment_entered': 'paymentEntered',
  'charge_from_date': 'chargeFromDate',
  'charge_to_date': 'chargeToDate',
  'primary_ins_zip': 'primaryInsZip',
  'primary_ins_city': 'primaryInsCity',
  'primary_ins_state': 'primaryInsState',
  'primary_ins_addr_1': 'primaryInsAddr1',
  'patient_zip': 'patientZip',
  'patient_city': 'patientCity',
  'patient_state': 'patientState',
  'patient_address_1': 'patientAddress1'
};

/**
 * Parse a date input which can be a string, number, or null.
 * Returns null if the date can't be parsed properly.
 */
function parseDate(dateInput: unknown): Date | null {
  if (dateInput === null || dateInput === undefined) return null;
  
  // Special case for numeric inputs (could be Excel serial dates or timestamps)
  if (typeof dateInput === 'number') {
    // Handle Excel dates (usually between 30000-50000)
    if (dateInput > 1000 && dateInput < 100000) { 
      // Excel dates are based on a different epoch (typically 1/1/1900 or 1/1/1904)
      const excelEpoch = new Date(1899, 11, 30);
      const resultDate = new Date(excelEpoch);
      resultDate.setDate(excelEpoch.getDate() + dateInput);
      return resultDate;
    }
    // Timestamp in seconds (convert to milliseconds)
    if (dateInput < 10000000000) {
      return new Date(dateInput * 1000);
    }
    // Timestamp in milliseconds
    return new Date(dateInput);
  }
  
  // Try to parse as a date string
  if (typeof dateInput === 'string') {
    // Handle special formats like "MM/DD/YYYY"
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateInput)) {
      const [month, day, year] = dateInput.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    
    // Try standard date parsing
    const date = new Date(dateInput);
    if (!isNaN(date.getTime())) {
      return date;
    }
  }
  
  // Return null for values we can't parse
  return null;
}

/**
 * Process a single record to match the database schema
 * and handle data type conversion properly.
 */
function cleanRow(row: Record<string, unknown>, headers: string[]): CleanedRecord {
  const cleanedRow: Record<string, unknown> = {};
  
  // Process each field according to mapping
  for (const originalHeader of headers) {
    const normalizedHeader = normalizeFieldName(originalHeader);
    const dbField = FIELD_MAPPING[normalizedHeader];
    
    if (dbField) {
      let value = row[originalHeader];
      
      // Handle special field types
      if (dbField.includes('Amount') || dbField.includes('payment') || dbField.includes('Payment')) {
        // Convert to number and handle currency formatting
        if (typeof value === 'string') {
          value = parseFloat(value.replace(/[\$,]/g, ''));
        } else if (value !== null && value !== undefined) {
          value = Number(value);
        }
        if (isNaN(value as number)) value = null;
      } 
      else if (dbField.includes('Date')) {
        value = parseDate(value);
      }
      
      cleanedRow[dbField] = value;
    }
  }
  
  // If LOC is missing, derive it from revenueCode or set to a default
  if (!cleanedRow.levelOfCare && cleanedRow.revenueCode) {
    cleanedRow.levelOfCare = deriveLevelOfCare(String(cleanedRow.revenueCode));
  } else if (!cleanedRow.levelOfCare) {
    cleanedRow.levelOfCare = 'UNKNOWN';
  }
  
  return cleanedRow;
}

/**
 * Derive level of care from revenue code - adjust based on your actual coding system
 */
function deriveLevelOfCare(revenueCode: string): string {
  if (!revenueCode) return 'UNKNOWN';
  
  const code = String(revenueCode).trim();
  
  // Map revenue codes to levels of care - customize this based on your data
  if (code.startsWith('1')) return 'IOP';
  if (code.startsWith('2')) return 'PHP';
  if (code.startsWith('3')) return 'RES';
  if (code.startsWith('4')) return 'DETOX';
  
  return 'OTHER';
}

/**
 * Parse CSV files with better error handling
 */
export async function parseCSV(fileContent: string): Promise<{
  headers: string[];
  data: CleanedRecord[];
  previewData: CleanedRecord[];
}> {
  return new Promise((resolve, reject) => {
    console.log("Starting CSV parsing...");
    
    const startTime = Date.now();
    let rowCount = 0;
    let headers: string[] = [];
    const data: CleanedRecord[] = [];
    
    Papa.parse(fileContent, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      chunk: function(results) {
        try {
          rowCount += results.data.length;
          
          if (!headers.length && results.meta.fields) {
            headers = results.meta.fields;
            console.log("CSV Headers:", headers);
          }
          
          // Clean and transform the data for each chunk
          const cleanedChunk = results.data
            .filter(row => Object.keys(row).length > 0) // Filter out empty rows
            .map((row: Record<string, unknown>) => cleanRow(row, headers));
          
          data.push(...cleanedChunk);
          
          // Log progress for large files
          if (rowCount % 10000 === 0) {
            console.log(`Processed ${rowCount} rows...`);
          }
        } catch (error) {
          console.error("Error processing chunk:", error);
          // Continue processing other chunks
        }
      },
      complete: () => {
        const endTime = Date.now();
        console.log(`CSV parsing complete. Processed ${rowCount} rows in ${(endTime - startTime) / 1000} seconds.`);
        
        resolve({
          headers,
          data,
          previewData: data.slice(0, 10) // Return the first 10 rows as preview
        });
      },
      error: (error) => {
        console.error("CSV parsing error:", error);
        reject(error);
      }
    });
  });
}

/**
 * Parse Excel files with improved error handling
 */
export function parseExcel(fileContent: ArrayBuffer): {
  headers: string[];
  data: CleanedRecord[];
  previewData: CleanedRecord[];
} {
  console.log("Starting Excel parsing...");
  const startTime = Date.now();
  
  // Configure XLSX to handle dates properly
  const workbook = XLSX.read(fileContent, { 
    type: 'array',
    cellDates: true,
    cellNF: false,
    cellStyles: false
  });
  
  // Get the first sheet
  const firstSheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[firstSheetName];
  
  console.log(`Processing Excel sheet: ${firstSheetName}`);
  
  // Convert to JSON with appropriate options
  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    header: 1,
    defval: null,
    raw: false
  });
  
  if (rawData.length < 2) {
    throw new Error('File does not contain enough data (needs headers and at least one row)');
  }
  
  // Extract headers from the first row
  const headers = ((rawData[0] || []) as unknown[]).map(h => 
    h ? String(h).trim() : ''
  ).filter(Boolean);
  
  console.log("Excel Headers:", headers);
  
  if (headers.length === 0) {
    throw new Error('No valid headers found in the Excel file');
  }
  
  // Process data rows
  const cleanedData: CleanedRecord[] = [];
  
  // Skip the header row (index 0)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || !Array.isArray(row) || row.length === 0) continue;
    
    try {
      // Convert row array to object with header keys
      const rowData: Record<string, unknown> = {};
      headers.forEach((header, index) => {
        if (index < row.length) {
          rowData[header] = row[index];
        }
      });
      
      // Clean and transform the row data
      const cleanedRow = cleanRow(rowData, headers);
      cleanedData.push(cleanedRow);
    } catch (error) {
      console.error(`Error processing row ${i}:`, error);
      // Continue with next row
    }
  }
  
  const endTime = Date.now();
  console.log(`Excel parsing complete. Processed ${cleanedData.length} rows in ${(endTime - startTime) / 1000} seconds.`);
  
  return {
    headers,
    data: cleanedData,
    previewData: cleanedData.slice(0, 10)
  };
}

/**
 * Save data to database with more reliable error handling
 */
export async function saveDataToDatabase(data: CleanedRecord[]): Promise<void> {
  console.log(`Starting database save for ${data.length} records...`);
  const startTime = Date.now();
  
  if (data.length === 0) {
    console.log("No data to save.");
    return;
  }
  
  // Use very small batch sizes for large datasets
  const batchSize = 50;
  const totalBatches = Math.ceil(data.length / batchSize);
  let savedCount = 0;
  
  for (let i = 0; i < data.length; i += batchSize) {
    const batchNumber = Math.floor(i / batchSize) + 1;
    const batch = data.slice(i, i + batchSize);
    
    console.log(`Saving batch ${batchNumber}/${totalBatches} (${batch.length} records)...`);
    
    try {
      // Try to save the batch
      await db.claimRecord.createMany({
        data: batch as any[],
        skipDuplicates: true,
      });
      savedCount += batch.length;
    } catch (error) {
      console.error(`Error saving batch ${batchNumber}:`, error);
      
      // If batch fails, try saving records one by one
      console.log("Attempting to save records individually...");
      for (const record of batch) {
        try {
          await db.claimRecord.create({
            data: record as any,
          });
          savedCount++;
        } catch (recordError) {
          console.error("Failed to save individual record:", recordError);
        }
      }
    }
  }
  
  const endTime = Date.now();
  console.log(`Database save complete. Saved ${savedCount} out of ${data.length} records in ${(endTime - startTime) / 1000} seconds.`);
}

/**
 * Calculate metrics for levels of care
 */
export async function calculateMetrics(filters: Record<string, unknown> = {}): Promise<Array<Record<string, unknown>>> {
  console.log("Calculating metrics with filters:", filters);
  
  const levelsOfCare = ['DETOX', 'RES', 'PHP', 'IOP', 'OTHER'];
  const results: Array<Record<string, unknown>> = [];
  
  for (const levelOfCare of levelsOfCare) {
    // Build query filters for the current level of care
    const whereClause: Record<string, unknown> = {
      levelOfCare,
      ...filters
    };
    
    // Count records matching the filters
    let count: number;
    try {
      count = await db.claimRecord.count({
        where: whereClause as any
      });
    } catch (error) {
      console.error(`Error counting records for ${levelOfCare}:`, error);
      count = 0;
    }
    
    if (count === 0) {
      results.push({
        levelOfCare,
        recordCount: 0,
        averageAllowedAmount: 0,
        minAllowedAmount: 0,
        maxAllowedAmount: 0,
        medianAllowedAmount: 0,
        modeAllowedAmount: 0,
        ...filters
      });
      continue;
    }
    
    // Calculate metrics for the allowed amounts
    try {
      // Get allowed amounts
      const allowedAmounts = await db.claimRecord.findMany({
        where: whereClause as any,
        select: { allowedAmount: true },
      });
      
      // Filter out null values
      const validAmounts = allowedAmounts
        .map(item => item.allowedAmount)
        .filter((amount): amount is number => amount !== null && amount !== undefined);
      
      // Calculate basic metrics
      const sum = validAmounts.reduce((acc, val) => acc + val, 0);
      const average = validAmounts.length > 0 ? sum / validAmounts.length : 0;
      const min = validAmounts.length > 0 ? Math.min(...validAmounts) : 0;
      const max = validAmounts.length > 0 ? Math.max(...validAmounts) : 0;
      
      // Calculate median
      const sorted = [...validAmounts].sort((a, b) => a - b);
      const middle = Math.floor(sorted.length / 2);
      const median = sorted.length > 0
        ? sorted.length % 2 === 0
          ? (sorted[middle - 1] + sorted[middle]) / 2
          : sorted[middle]
        : 0;
      
      // Calculate mode
      const frequency: Record<number, number> = {};
      validAmounts.forEach(val => {
        frequency[val] = (frequency[val] || 0) + 1;
      });
      
      let mode = 0;
      let maxFrequency = 0;
      for (const [val, freq] of Object.entries(frequency)) {
        if (freq > maxFrequency) {
          maxFrequency = freq;
          mode = parseFloat(val);
        }
      }
      
      // Prepare metrics object
      const metrics: Record<string, unknown> = {
        levelOfCare,
        recordCount: count,
        averageAllowedAmount: average,
        minAllowedAmount: min,
        maxAllowedAmount: max,
        medianAllowedAmount: median,
        modeAllowedAmount: mode,
        ...filters
      };
      
      results.push(metrics);
      
      // Try to save metrics
      try {
        await db.calculatedMetrics.upsert({
          where: {
            levelOfCare_stateTreatedAt_payerName_payerClass_serviceYear_paymentReceivedYear: {
              levelOfCare,
              stateTreatedAt: (filters.stateTreatedAt as string) || '',
              payerName: (filters.payerName as string) || '',
              payerClass: (filters.payerClass as string) || '',
              serviceYear: (filters.serviceYear as number) || 0,
              paymentReceivedYear: (filters.paymentReceivedYear as number) || 0,
            }
          },
          update: metrics as any,
          create: metrics as any,
        });
      } catch (error) {
        console.error(`Error saving metrics for ${levelOfCare}:`, error);
        // Continue processing other levels of care
      }
      
    } catch (error) {
      console.error(`Error calculating metrics for ${levelOfCare}:`, error);
      results.push({
        levelOfCare,
        recordCount: count,
        averageAllowedAmount: 0,
        minAllowedAmount: 0,
        maxAllowedAmount: 0,
        medianAllowedAmount: 0,
        modeAllowedAmount: 0,
        ...filters
      });
    }
  }
  
  return results;
}