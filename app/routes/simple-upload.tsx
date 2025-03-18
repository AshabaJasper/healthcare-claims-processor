import { useState } from "react";
import type { ActionFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useActionData, Link } from "@remix-run/react";
import { parseCSV, parseExcel, saveDataToDatabase, calculateMetrics } from "~/utils/fixedFileParser.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("Simple upload action function called");
  
  try {
    // Get raw FormData directly
    const formData = await request.formData();
    const fileData = formData.get("file") as File | null;
    
    if (!fileData) {
      console.log("No file found in the form data");
      return json({ error: "No file uploaded" }, { status: 400 });
    }
    
    console.log(`File received: ${fileData.name}, size: ${fileData.size} bytes`);
    
    // Get file extension
    const fileName = fileData.name;
    const fileExtension = fileName.split('.').pop()?.toLowerCase();
    
    // Process file based on type
    let parsedData;
    
    try {
      if (fileExtension === 'csv') {
        // Process CSV file
        const fileContent = await fileData.text();
        parsedData = await parseCSV(fileContent);
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Process Excel file
        const fileBuffer = await fileData.arrayBuffer();
        parsedData = parseExcel(fileBuffer);
      } else {
        return json(
          { error: "Unsupported file format. Please upload CSV or Excel files." },
          { status: 400 }
        );
      }
    } catch (parseError) {
      console.error("Error parsing file:", parseError);
      return json(
        { error: `Error parsing file: ${parseError instanceof Error ? parseError.message : String(parseError)}` },
        { status: 400 }
      );
    }
    
    // Check if we have any data to process
    if (!parsedData || !parsedData.data || !parsedData.data.length) {
      return json(
        { error: "No valid data found in the uploaded file." },
        { status: 400 }
      );
    }
    
    console.log(`Successfully parsed ${parsedData.data.length} records. Sample:`, parsedData.previewData[0]);
    
    // Save data to database
    try {
      await saveDataToDatabase(parsedData.data);
    } catch (dbError) {
      console.error("Error saving to database:", dbError);
      return json(
        { error: `Error saving to database: ${dbError instanceof Error ? dbError.message : String(dbError)}` },
        { status: 500 }
      );
    }
    
    // Calculate initial metrics
    let metrics = [];
    try {
      metrics = await calculateMetrics();
    } catch (metricsError) {
      console.error("Error calculating metrics:", metricsError);
      // Continue even if metrics calculation fails
      metrics = [];
    }
    
    return json({
      success: true,
      message: `Successfully processed ${parsedData.data.length} records.`,
      previewData: parsedData.previewData,
      headers: parsedData.headers,
      metrics
    });
    
  } catch (error) {
    console.error("Error processing file:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return json({ error: `Error processing file: ${errorMessage}` }, { status: 500 });
  }
};

export default function SimpleUpload() {
  const actionData = useActionData<any>();
  const [isUploading, setIsUploading] = useState(false);
  
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    setIsUploading(true);
    // The form will submit normally
  };
  
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "20px", color: "#0284c7" }}>
        Healthcare Claims Processor - File Upload
      </h1>
      
      {/* Plain HTML form with encType multipart/form-data */}
      <form 
        method="post" 
        encType="multipart/form-data" 
        style={{ 
          marginBottom: "20px", 
          padding: "20px", 
          border: "1px solid #e5e7eb", 
          borderRadius: "8px",
          backgroundColor: "#f9fafb"
        }}
        onSubmit={handleSubmit}
      >
        <div style={{ marginBottom: "20px" }}>
          <label htmlFor="file" style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>
            Select a file (CSV or Excel):
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept=".csv,.xlsx,.xls"
            style={{ display: "block", width: "100%", padding: "8px", border: "1px solid #d1d5db", borderRadius: "4px" }}
          />
          <p style={{ marginTop: "8px", fontSize: "12px", color: "#6b7280" }}>
            Files can be up to 100MB in size. Larger files may take longer to process.
          </p>
        </div>
        
        <button
          type="submit"
          disabled={isUploading}
          style={{
            backgroundColor: isUploading ? "#9ca3af" : "#0284c7",
            color: "white",
            padding: "10px 16px",
            border: "none",
            borderRadius: "4px",
            cursor: isUploading ? "not-allowed" : "pointer",
            fontWeight: "bold"
          }}
        >
          {isUploading ? "Processing..." : "Upload and Process"}
        </button>
      </form>
      
      {/* Navigation link */}
      <div style={{ marginBottom: "20px" }}>
        <Link to="/" style={{ color: "#0284c7", textDecoration: "none" }}>
          Back to Home
        </Link>
      </div>
      
      {/* Error message */}
      {actionData?.error && (
        <div style={{ 
          padding: "16px", 
          backgroundColor: "#fee2e2", 
          color: "#b91c1c", 
          borderRadius: "4px", 
          marginBottom: "20px",
          border: "1px solid #f87171"
        }}>
          <strong>Error:</strong> {actionData.error}
        </div>
      )}
      
      {/* Success message */}
      {actionData?.success && (
        <div style={{ 
          padding: "16px", 
          backgroundColor: "#ecfdf5", 
          color: "#047857", 
          borderRadius: "4px", 
          marginBottom: "20px",
          border: "1px solid #6ee7b7"
        }}>
          <strong>Success!</strong> {actionData.message}
        </div>
      )}
      
      {/* Data preview */}
      {actionData?.success && (
        <div>
          <h2 style={{ fontSize: "20px", fontWeight: "bold", marginBottom: "16px", color: "#0284c7" }}>
            Data Preview
          </h2>
          
          <div style={{ overflowX: "auto", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {actionData.headers.slice(0, 5).map((header: string) => (
                    <th key={header} style={{ 
                      padding: "8px", 
                      backgroundColor: "#f3f4f6", 
                      textAlign: "left",
                      border: "1px solid #e5e7eb",
                      fontWeight: "bold"
                    }}>
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {actionData.previewData.slice(0, 5).map((row: any, rowIndex: number) => (
                  <tr key={rowIndex}>
                    {actionData.headers.slice(0, 5).map((header: string, colIndex: number) => (
                      <td key={`${rowIndex}-${colIndex}`} style={{ 
                        padding: "8px", 
                        border: "1px solid #e5e7eb" 
                      }}>
                        {row[header] !== null && row[header] !== undefined
                          ? String(row[header])
                          : "—"}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div>
            <h3 style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "12px", color: "#0284c7" }}>
              Results Summary
            </h3>
            {actionData.metrics && actionData.metrics.length > 0 ? (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px", backgroundColor: "#f3f4f6", textAlign: "left", border: "1px solid #e5e7eb" }}>Level of Care</th>
                    <th style={{ padding: "8px", backgroundColor: "#f3f4f6", textAlign: "left", border: "1px solid #e5e7eb" }}>Count</th>
                    <th style={{ padding: "8px", backgroundColor: "#f3f4f6", textAlign: "left", border: "1px solid #e5e7eb" }}>Avg Allowed</th>
                  </tr>
                </thead>
                <tbody>
                  {actionData.metrics.map((metric: any) => (
                    <tr key={metric.levelOfCare}>
                      <td style={{ padding: "8px", border: "1px solid #e5e7eb" }}>{metric.levelOfCare}</td>
                      <td style={{ padding: "8px", border: "1px solid #e5e7eb" }}>{metric.recordCount}</td>
                      <td style={{ padding: "8px", border: "1px solid #e5e7eb" }}>${(metric.averageAllowedAmount).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p>No metrics available. Data has been saved but metrics could not be calculated.</p>
            )}
          </div>
          
          <div style={{ marginTop: "20px" }}>
            <Link 
              to="/dashboard" 
              style={{
                display: "inline-block",
                backgroundColor: "#0284c7",
                color: "white",
                padding: "8px 16px",
                border: "none",
                borderRadius: "4px",
                textDecoration: "none",
                fontWeight: "bold"
              }}
            >
              Go to Dashboard
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}