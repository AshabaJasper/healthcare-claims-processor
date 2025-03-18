import { useState } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";

// Number of records per page
const PAGE_SIZE = 20;

// Types
interface ClaimRecord {
  id: number;
  levelOfCare: string | null;
  payerName: string | null;
  patientState: string | null;
  chargeFromDate: string | null;
  chargeAmount: number | null;
  allowedAmount: number | null;
  payment: number | null;
  [key: string]: unknown;
}

interface FilterOptions {
  levelOfCareOptions: string[];
  stateOptions: string[];
  payerOptions: string[];
}

interface Filters {
  levelOfCare: string;
  stateTreatedAt: string;
  payerName: string;
}

interface Pagination {
  currentPage: number;
  totalPages: number;
  totalRecords: number;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Check if we have any data in the database
  const count = await db.claimRecord.count();
  
  if (count === 0) {
    return redirect("/upload");
  }
  
  // Get URL parameters for filters and pagination
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const levelOfCare = url.searchParams.get("levelOfCare") || "";
  const stateTreatedAt = url.searchParams.get("stateTreatedAt") || "";
  const payerName = url.searchParams.get("payerName") || "";
  
  // Build filter object
  const whereClause: Record<string, unknown> = {};
  if (levelOfCare) whereClause.levelOfCare = levelOfCare;
  if (stateTreatedAt) whereClause.patientState = stateTreatedAt;
  if (payerName) whereClause.payerName = payerName;
  
  // Get total records with filters
  const filteredCount = await db.claimRecord.count({
    where: whereClause as any
  });
  
  const totalPages = Math.ceil(filteredCount / PAGE_SIZE);
  const currentPage = Math.max(1, Math.min(page, totalPages));
  
  // Get records for current page
  const records = await db.claimRecord.findMany({
    where: whereClause as any,
    orderBy: {
      chargeFromDate: 'desc'
    },
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
  });
  
  // Get unique filter options
  const levelOfCareOptions = await db.claimRecord.groupBy({
    by: ['levelOfCare'],
    where: {
      levelOfCare: {
        not: null
      }
    }
  });
  
  const stateOptions = await db.claimRecord.groupBy({
    by: ['patientState'],
    where: {
      patientState: {
        not: null
      }
    }
  });
  
  const payerOptions = await db.claimRecord.groupBy({
    by: ['payerName'],
    where: {
      payerName: {
        not: null
      }
    }
  });
  
  return json({
    records,
    pagination: {
      currentPage,
      totalPages,
      totalRecords: filteredCount,
    },
    filters: {
      levelOfCare,
      stateTreatedAt,
      payerName,
    },
    filterOptions: {
      levelOfCareOptions: levelOfCareOptions.map(o => o.levelOfCare),
      stateOptions: stateOptions.map(o => o.patientState),
      payerOptions: payerOptions.map(o => o.payerName),
    }
  });
};

export default function DataTable() {
  const { 
    records, 
    pagination, 
    filters, 
    filterOptions 
  } = useLoaderData<typeof loader>();
  
  const submit = useSubmit();
  const [currentFilters, setCurrentFilters] = useState<Filters>(filters);
  
  // Filter change handler
  const handleFilterChange = (filterName: string, value: string) => {
    setCurrentFilters(prev => ({
      ...prev,
      [filterName]: value,
    }));
    
    const formData = new FormData();
    Object.entries({
      ...currentFilters,
      [filterName]: value,
      page: 1, // Reset to first page on filter change
    }).forEach(([key, value]) => {
      if (value) {
        formData.append(key, String(value));
      }
    });
    
    submit(formData, { method: "get", replace: true });
  };
  
  // Reset filters
  const resetFilters = () => {
    setCurrentFilters({
      levelOfCare: "",
      stateTreatedAt: "",
      payerName: "",
    });
    
    submit(new FormData(), { method: "get", replace: true });
  };
  
  // Pagination handler
  const goToPage = (page: number) => {
    const formData = new FormData();
    Object.entries({
      ...currentFilters,
      page,
    }).forEach(([key, value]) => {
      if (value) {
        formData.append(key, String(value));
      }
    });
    
    submit(formData, { method: "get", replace: true });
  };
  
  // Format date for display
  const formatDate = (date: string | null) => {
    if (!date) return "—";
    return new Date(date).toLocaleDateString();
  };
  
  // Format currency for display
  const formatCurrency = (amount: number | null) => {
    if (amount === null || amount === undefined) return "—";
    return `$${amount.toFixed(2)}`;
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Claims Data</h1>
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Dashboard
          </Link>
          <Link
            to="/upload"
            className="ml-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Upload More Data
          </Link>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-medium text-gray-900">Filters</h2>
          <button
            type="button"
            onClick={resetFilters}
            className="text-sm text-primary-600 hover:text-primary-800"
          >
            Reset All Filters
          </button>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Level of Care Filter */}
          <div>
            <label htmlFor="levelOfCare" className="block text-sm font-medium text-gray-700">
              Level of Care
            </label>
            <select
              id="levelOfCare"
              name="levelOfCare"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.levelOfCare}
              onChange={(e) => handleFilterChange("levelOfCare", e.target.value)}
            >
              <option value="">All Levels</option>
              {filterOptions.levelOfCareOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          
          {/* State Filter */}
          <div>
            <label htmlFor="stateTreatedAt" className="block text-sm font-medium text-gray-700">
              State
            </label>
            <select
              id="stateTreatedAt"
              name="stateTreatedAt"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.stateTreatedAt}
              onChange={(e) => handleFilterChange("stateTreatedAt", e.target.value)}
            >
              <option value="">All States</option>
              {filterOptions.stateOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          
          {/* Payer Filter */}
          <div>
            <label htmlFor="payerName" className="block text-sm font-medium text-gray-700">
              Payer
            </label>
            <select
              id="payerName"
              name="payerName"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.payerName}
              onChange={(e) => handleFilterChange("payerName", e.target.value)}
            >
              <option value="">All Payers</option>
              {filterOptions.payerOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Data Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex flex-col">
          <div className="-my-2 overflow-x-auto sm:-mx-6 lg:-mx-8">
            <div className="py-2 align-middle inline-block min-w-full sm:px-6 lg:px-8">
              <div className="overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Level of Care
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payer
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        State
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Service Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Charge Amount
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Allowed Amount
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Payment
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {records.length > 0 ? (
                      records.map((record: ClaimRecord) => (
                        <tr key={record.id}>
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {record.levelOfCare || "—"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {record.payerName || "—"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {record.patientState || "—"}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(record.chargeFromDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatCurrency(record.chargeAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatCurrency(record.allowedAmount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatCurrency(record.payment)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                          No records found matching the current filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        
        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <nav
            className="bg-white px-4 py-3 flex items-center justify-between border-t border-gray-200 sm:px-6"
            aria-label="Pagination"
          >
            <div className="hidden sm:block">
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{(pagination.currentPage - 1) * PAGE_SIZE + 1}</span> to{" "}
                <span className="font-medium">
                  {Math.min(pagination.currentPage * PAGE_SIZE, pagination.totalRecords)}
                </span>{" "}
                of <span className="font-medium">{pagination.totalRecords}</span> results
              </p>
            </div>
            <div className="flex-1 flex justify-between sm:justify-end">
              <button
                onClick={() => goToPage(pagination.currentPage - 1)}
                disabled={pagination.currentPage === 1}
                className={`relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white ${
                  pagination.currentPage === 1
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-50"
                }`}
              >
                Previous
              </button>
              <button
                onClick={() => goToPage(pagination.currentPage + 1)}
                disabled={pagination.currentPage === pagination.totalPages}
                className={`ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white ${
                  pagination.currentPage === pagination.totalPages
                    ? "opacity-50 cursor-not-allowed"
                    : "hover:bg-gray-50"
                }`}
              >
                Next
              </button>
            </div>
          </nav>
        )}
      </div>
    </div>
  );
}