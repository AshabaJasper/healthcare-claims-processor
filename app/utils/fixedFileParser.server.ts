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
 * Returns a Date object if the input is valid, otherwise returns null.
 */
function parseDate(dateInput: unknown): Date | null {
  // Handle null or undefined
  if (dateInput === null || dateInput === undefined) return null;
  
  // If already a Date object, return it
  if (dateInput instanceof Date && !isNaN(dateInput.getTime())) return dateInput;
  
  // Handle numeric inputs
  if (typeof dateInput === 'number') {
    // If the numeric value is too small to be a valid date, return null
    if (dateInput < 1000) return null;
    
    // Handle Excel serial dates (typically between 30000-50000)
    if (dateInput > 1000 && dateInput < 100000) {
      const excelEpoch = new Date(1899, 11, 30);
      const resultDate = new Date(excelEpoch);
      resultDate.setDate(excelEpoch.getDate() + dateInput);
      return resultDate;
    }
    
    // Handle Unix timestamp in seconds
    if (dateInput < 10000000000) {
      return new Date(dateInput * 1000);
    }
    
    // Assume millisecond timestamp
    return new Date(dateInput);
  }
  
  // Handle string inputs
  if (typeof dateInput === 'string') {
    // Trim and check for empty string
    const trimmedInput = dateInput.trim();
    if (trimmedInput === '') return null;
    
    // Handle special format "MM/DD/YYYY"
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(trimmedInput)) {
      const [month, day, year] = trimmedInput.split('/').map(Number);
      return new Date(year, month - 1, day);
    }
    
    // Try standard date parsing
    const parsedDate = new Date(trimmedInput);
    if (!isNaN(parsedDate.getTime())) return parsedDate;
  }
  
  // Return null if unable to parse
  return null;
}

/**
 * Process a single record to match the database schema
 * and handle data type conversion properly.
 */
function cleanRow(row: Record<string, unknown>, headers: string[]): CleanedRecord {
  const cleanedRow: Record<string, unknown> = {};

  // Define field type sets based on your Prisma schema
  const numericFields = new Set(['chargeAmount', 'payment', 'allowedAmount', 'paymentTotal']);
  const dateFields = new Set(['paymentReceived', 'paymentEntered', 'chargeFromDate', 'chargeToDate']);
  const stringFields = new Set([
    'practiceName', 'charge', 'cptCode', 'revenueCode', 'levelOfCare',
    'primaryGroup', 'claimPrimaryID', 'payerName', 'payerGroup', 'primaryInsZip',
    'primaryInsCity', 'primaryInsState', 'primaryInsAddr1', 'patientZip',
    'patientCity', 'patientState', 'patientAddress1', 'payerClass', 'employerName',
    'prefix', 'groupPolicy'
  ]);

  // Process each field according to mapping
  for (const originalHeader of headers) {
    const normalizedHeader = normalizeFieldName(originalHeader);
    const dbField = FIELD_MAPPING[normalizedHeader];
    
    if (dbField) {
      let value = row[originalHeader];

      if (dateFields.has(dbField)) {
        // Force parsing to Date or null, being extra strict
        try {
          value = parseDate(value);
        } catch {
          value = null;
        }
        
        // Additional fallback to null if parsing fails
        if (value === undefined) value = null;
      } else if (numericFields.has(dbField)) {
        // Convert to number, stripping out currency symbols/commas if needed
        if (typeof value === 'string') {
          value = parseFloat(value.replace(/[\$,]/g, ''));
        } else if (value !== null && value !== undefined) {
          value = Number(value);
        }
        if (isNaN(value as number)) value = null;
      } else if (stringFields.has(dbField)) {
        // Convert to string if it comes as a number (or leave as-is if already a string)
        if (typeof value === 'number') {
          value = String(value);
        } else if (value !== null && value !== undefined) {
          value = String(value);
        }
      }
      // Otherwise, leave the value as-is

      cleanedRow[dbField] = value;
    }
  }

  // If levelOfCare is missing, derive it from revenueCode or set to a default
  if (!cleanedRow.levelOfCare && cleanedRow.revenueCode) {
    cleanedRow.levelOfCare = deriveLevelOfCare(String(cleanedRow.revenueCode));
  } else if (!cleanedRow.levelOfCare) {
    cleanedRow.levelOfCare = 'UNKNOWN';
  }

  return cleanedRow;
}

// ... (rest of the previous file remains the same)

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
    
    // Deep clone and transform the batch to ensure correct types
    const processedBatch = batch.map(record => {
      const processedRecord: Record<string, unknown> = { ...record };
      
      // Explicitly handle date fields
      const dateFields = ['paymentReceived', 'paymentEntered', 'chargeFromDate', 'chargeToDate'];
      dateFields.forEach(field => {
        if (processedRecord[field] !== undefined) {
          // Ensure it's either a Date or null
          processedRecord[field] = processedRecord[field] instanceof Date 
            ? processedRecord[field] 
            : null;
        }
      });
      
      return processedRecord;
    });
    
    try {
      // Try to save the batch
      await db.claimRecord.createMany({
        data: processedBatch as any[],
        skipDuplicates: true,
      });
      savedCount += batch.length;
    } catch (error) {
      console.error(`Error saving batch ${batchNumber}:`, error);
      
      // If batch fails, try saving records one by one
      console.log("Attempting to save records individually...");
      for (const record of processedBatch) {
        try {
          await db.claimRecord.create({
            data: record as any,
          });
          savedCount++;
        } catch (recordError) {
          console.error("Failed to save individual record:", recordError);
          // Log the problematic record for debugging
          console.error("Problematic record:", JSON.stringify(record, null, 2));
        }
      }
    }
  }
  
  const endTime = Date.now();
  console.log(`Database save complete. Saved ${savedCount} out of ${data.length} records in ${(endTime - startTime) / 1000} seconds.`);
}