import { useState, useEffect } from "react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { useLoaderData, Link, useSubmit } from "@remix-run/react";
import { db } from "~/utils/db.server";
import { calculateMetrics } from "~/utils/fixedFileParser.server";

// Define types for metrics
type Metric = {
  levelOfCare: string;
  recordCount: number;
  averageAllowedAmount: number;
  minAllowedAmount: number;
  maxAllowedAmount: number;
  medianAllowedAmount: number;
  modeAllowedAmount: number;
  [key: string]: string | number | undefined;
};

// Define types for filters
type FilterOptions = {
  states: string[];
  payers: string[];
  payerClasses: string[];
  employers: string[];
  prefixes: string[];
  groupPolicies: string[];
  policyHolderStates: string[];
  serviceYears: number[];
  paymentYears: number[];
};

type Filters = {
  stateTreatedAt: string;
  payerName: string;
  payerClass: string;
  employerName: string;
  prefix: string;
  groupPolicy: string;
  policyHolderState: string;
  serviceYear: number;
  paymentReceivedYear: number;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Check if we have any data in the database
  const count = await db.claimRecord.count();
  
  if (count === 0) {
    return redirect("/upload");
  }
  
  // Get URL parameters for filters
  const url = new URL(request.url);
  const stateTreatedAt = url.searchParams.get("stateTreatedAt") || "";
  const payerName = url.searchParams.get("payerName") || "";
  const payerClass = url.searchParams.get("payerClass") || "";
  const employerName = url.searchParams.get("employerName") || "";
  const prefix = url.searchParams.get("prefix") || "";
  const groupPolicy = url.searchParams.get("groupPolicy") || "";
  const policyHolderState = url.searchParams.get("policyHolderState") || "";
  const serviceYear = url.searchParams.get("serviceYear") ? parseInt(url.searchParams.get("serviceYear")!) : 0;
  const paymentReceivedYear = url.searchParams.get("paymentReceivedYear") ? parseInt(url.searchParams.get("paymentReceivedYear")!) : 0;
  
  // Build filter object
  const filters: Record<string, unknown> = {};
  if (stateTreatedAt) filters.patientState = stateTreatedAt;
  if (payerName) filters.payerName = payerName;
  if (payerClass) filters.payerClass = payerClass;
  if (employerName) filters.employerName = employerName;
  if (prefix) filters.prefix = prefix;
  if (groupPolicy) filters.groupPolicy = groupPolicy;
  if (policyHolderState) filters.primaryInsState = policyHolderState;
  if (serviceYear) {
    filters.chargeFromDate = {
      gte: new Date(`${serviceYear}-01-01`),
      lt: new Date(`${serviceYear + 1}-01-01`)
    };
  }
  if (paymentReceivedYear) {
    filters.paymentReceived = {
      gte: new Date(`${paymentReceivedYear}-01-01`),
      lt: new Date(`${paymentReceivedYear + 1}-01-01`)
    };
  }
  
  // Calculate metrics with filters
  const metrics = await calculateMetrics(filters);
  
  // Get unique filter options for dropdowns
  const states = await db.claimRecord.groupBy({
    by: ['patientState'],
    where: {
      patientState: {
        not: null
      }
    }
  });
  
  const payers = await db.claimRecord.groupBy({
    by: ['payerName'],
    where: {
      payerName: {
        not: null
      }
    }
  });
  
  const payerClasses = await db.claimRecord.groupBy({
    by: ['payerClass'],
    where: {
      payerClass: {
        not: null
      }
    }
  });
  
  const employers = await db.claimRecord.groupBy({
    by: ['employerName'],
    where: {
      employerName: {
        not: null
      }
    }
  });
  
  const prefixes = await db.claimRecord.groupBy({
    by: ['prefix'],
    where: {
      prefix: {
        not: null
      }
    }
  });
  
  const groupPolicies = await db.claimRecord.groupBy({
    by: ['groupPolicy'],
    where: {
      groupPolicy: {
        not: null
      }
    }
  });
  
  const policyHolderStates = await db.claimRecord.groupBy({
    by: ['primaryInsState'],
    where: {
      primaryInsState: {
        not: null
      }
    }
  });
  
  // Get unique years for service dates and payment received dates
  const earliestChargeDate = await db.claimRecord.findFirst({
    where: {
      chargeFromDate: {
        not: null
      }
    },
    orderBy: {
      chargeFromDate: 'asc'
    },
    select: {
      chargeFromDate: true
    }
  });
  
  const latestChargeDate = await db.claimRecord.findFirst({
    where: {
      chargeFromDate: {
        not: null
      }
    },
    orderBy: {
      chargeFromDate: 'desc'
    },
    select: {
      chargeFromDate: true
    }
  });
  
  const earliestPaymentDate = await db.claimRecord.findFirst({
    where: {
      paymentReceived: {
        not: null
      }
    },
    orderBy: {
      paymentReceived: 'asc'
    },
    select: {
      paymentReceived: true
    }
  });
  
  const latestPaymentDate = await db.claimRecord.findFirst({
    where: {
      paymentReceived: {
        not: null
      }
    },
    orderBy: {
      paymentReceived: 'desc'
    },
    select: {
      paymentReceived: true
    }
  });
  
  // Generate year ranges
  const serviceYears: number[] = [];
  const paymentYears: number[] = [];
  
  if (earliestChargeDate?.chargeFromDate && latestChargeDate?.chargeFromDate) {
    const startYear = earliestChargeDate.chargeFromDate.getFullYear();
    const endYear = latestChargeDate.chargeFromDate.getFullYear();
    
    for (let year = startYear; year <= endYear; year++) {
      serviceYears.push(year);
    }
  }
  
  if (earliestPaymentDate?.paymentReceived && latestPaymentDate?.paymentReceived) {
    const startYear = earliestPaymentDate.paymentReceived.getFullYear();
    const endYear = latestPaymentDate.paymentReceived.getFullYear();
    
    for (let year = startYear; year <= endYear; year++) {
      paymentYears.push(year);
    }
  }
  
  return json({
    metrics: metrics as Metric[],
    filters: {
      stateTreatedAt,
      payerName,
      payerClass,
      employerName,
      prefix,
      groupPolicy,
      policyHolderState,
      serviceYear,
      paymentReceivedYear
    } as Filters,
    filterOptions: {
      states: states.map(s => s.patientState),
      payers: payers.map(p => p.payerName),
      payerClasses: payerClasses.map(pc => pc.payerClass),
      employers: employers.map(e => e.employerName),
      prefixes: prefixes.map(p => p.prefix),
      groupPolicies: groupPolicies.map(gp => gp.groupPolicy),
      policyHolderStates: policyHolderStates.map(phs => phs.primaryInsState),
      serviceYears,
      paymentYears
    } as FilterOptions
  });
};

export default function Dashboard() {
  const { 
    metrics, 
    filters, 
    filterOptions 
  } = useLoaderData<typeof loader>();
  
  const submit = useSubmit();
  const [currentFilters, setCurrentFilters] = useState<Filters>(filters);
  
  // Apply filters when they change
  useEffect(() => {
    const formData = new FormData();
    
    Object.entries(currentFilters).forEach(([key, value]) => {
      if (value) {
        formData.append(key, String(value));
      }
    });
    
    submit(formData, { method: "get", replace: true });
  }, [currentFilters, submit]);
  
  // Filter change handler
  const handleFilterChange = (filterName: string, value: string) => {
    setCurrentFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
  };
  
  // Reset filters
  const resetFilters = () => {
    setCurrentFilters({
      stateTreatedAt: "",
      payerName: "",
      payerClass: "",
      employerName: "",
      prefix: "",
      groupPolicy: "",
      policyHolderState: "",
      serviceYear: 0,
      paymentReceivedYear: 0
    });
  };
  
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">Claims Analysis Dashboard</h1>
        <div>
          <Link
            to="/upload"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Upload More Data
          </Link>
          <Link
            to="/"
            className="ml-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
          >
            Back to Home
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
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {/* State Treated */}
          <div>
            <label htmlFor="stateTreatedAt" className="block text-sm font-medium text-gray-700">
              State Treated At
            </label>
            <select
              id="stateTreatedAt"
              name="stateTreatedAt"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.stateTreatedAt}
              onChange={(e) => handleFilterChange("stateTreatedAt", e.target.value)}
            >
              <option value="">All States</option>
              {filterOptions.states.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          
          {/* Payer Name */}
          <div>
            <label htmlFor="payerName" className="block text-sm font-medium text-gray-700">
              Payer Name
            </label>
            <select
              id="payerName"
              name="payerName"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.payerName}
              onChange={(e) => handleFilterChange("payerName", e.target.value)}
            >
              <option value="">All Payers</option>
              {filterOptions.payers.map((payer) => (
                <option key={payer} value={payer}>
                  {payer}
                </option>
              ))}
            </select>
          </div>
          
          {/* Payer Class */}
          <div>
            <label htmlFor="payerClass" className="block text-sm font-medium text-gray-700">
              Payer Class
            </label>
            <select
              id="payerClass"
              name="payerClass"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.payerClass}
              onChange={(e) => handleFilterChange("payerClass", e.target.value)}
            >
              <option value="">All Classes</option>
              {filterOptions.payerClasses.map((payerClass) => (
                <option key={payerClass} value={payerClass}>
                  {payerClass}
                </option>
              ))}
            </select>
          </div>
          
          {/* Employer Name */}
          <div>
            <label htmlFor="employerName" className="block text-sm font-medium text-gray-700">
              Employer Name
            </label>
            <select
              id="employerName"
              name="employerName"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.employerName}
              onChange={(e) => handleFilterChange("employerName", e.target.value)}
            >
              <option value="">All Employers</option>
              {filterOptions.employers.map((employer) => (
                <option key={employer} value={employer}>
                  {employer}
                </option>
              ))}
            </select>
          </div>
          
          {/* Prefix */}
          <div>
            <label htmlFor="prefix" className="block text-sm font-medium text-gray-700">
              Prefix
            </label>
            <select
              id="prefix"
              name="prefix"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.prefix}
              onChange={(e) => handleFilterChange("prefix", e.target.value)}
            >
              <option value="">All Prefixes</option>
              {filterOptions.prefixes.map((prefix) => (
                <option key={prefix} value={prefix}>
                  {prefix}
                </option>
              ))}
            </select>
          </div>
          
          {/* Group Policy */}
          <div>
            <label htmlFor="groupPolicy" className="block text-sm font-medium text-gray-700">
              Group Policy
            </label>
            <select
              id="groupPolicy"
              name="groupPolicy"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.groupPolicy}
              onChange={(e) => handleFilterChange("groupPolicy", e.target.value)}
            >
              <option value="">All Group Policies</option>
              {filterOptions.groupPolicies.map((policy) => (
                <option key={policy} value={policy}>
                  {policy}
                </option>
              ))}
            </select>
          </div>
          
          {/* Policy Holder State */}
          <div>
            <label htmlFor="policyHolderState" className="block text-sm font-medium text-gray-700">
              Policy Holder State
            </label>
            <select
              id="policyHolderState"
              name="policyHolderState"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.policyHolderState}
              onChange={(e) => handleFilterChange("policyHolderState", e.target.value)}
            >
              <option value="">All States</option>
              {filterOptions.policyHolderStates.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </div>
          
          {/* Service Year */}
          <div>
            <label htmlFor="serviceYear" className="block text-sm font-medium text-gray-700">
              Service Year
            </label>
            <select
              id="serviceYear"
              name="serviceYear"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.serviceYear || ""}
              onChange={(e) => handleFilterChange("serviceYear", e.target.value)}
            >
              <option value="">All Years</option>
              {filterOptions.serviceYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          
          {/* Payment Received Year */}
          <div>
            <label htmlFor="paymentReceivedYear" className="block text-sm font-medium text-gray-700">
              Payment Received Year
            </label>
            <select
              id="paymentReceivedYear"
              name="paymentReceivedYear"
              className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-primary-500 focus:border-primary-500 sm:text-sm rounded-md"
              value={currentFilters.paymentReceivedYear || ""}
              onChange={(e) => handleFilterChange("paymentReceivedYear", e.target.value)}
            >
              <option value="">All Years</option>
              {filterOptions.paymentYears.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Results Section */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Results by Level of Care</h2>
        </div>
        
        {/* Metrics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 p-6">
          {metrics.map((metric) => (
            <div
              key={metric.levelOfCare}
              className="bg-white rounded-lg border border-gray-200 shadow-sm p-6"
            >
              <h3 className="text-lg font-bold text-gray-900 mb-4">{metric.levelOfCare}</h3>
              
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Record Count:</span>
                  <span className="text-sm font-semibold text-gray-900">{metric.recordCount}</span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Average Allowed:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${metric.averageAllowedAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Min Allowed:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${metric.minAllowedAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Max Allowed:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${metric.maxAllowedAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Median Allowed:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${metric.medianAllowedAmount.toFixed(2)}
                  </span>
                </div>
                
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-gray-500">Mode Allowed:</span>
                  <span className="text-sm font-semibold text-gray-900">
                    ${metric.modeAllowedAmount.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
        
        {/* Visual Chart */}
        <div className="p-6 border-t border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Average Allowed Amount by Level of Care</h3>
          <div className="h-64">
            <BarChart metrics={metrics} />
          </div>
        </div>
      </div>
    </div>
  );
}

// Simple Bar Chart Component
function BarChart({ metrics }: { metrics: Metric[] }) {
  // Colors for different levels of care
  const getBarColor = (levelOfCare: string) => {
    switch (levelOfCare) {
      case 'DETOX': return 'bg-red-500';
      case 'RES': return 'bg-blue-500';
      case 'PHP': return 'bg-green-500';
      case 'IOP': return 'bg-yellow-500';
      default: return 'bg-gray-500';
    }
  };
  
  // Find max value for scaling
  const maxValue = Math.max(...metrics.map(m => m.averageAllowedAmount), 1);
  
  return (
    <div className="h-full flex items-end space-x-6">
      {metrics.map((metric) => {
        const percentage = (metric.averageAllowedAmount / maxValue) * 100;
        return (
          <div key={metric.levelOfCare} className="flex-1 flex flex-col items-center">
            <div className="w-full relative" style={{ height: 'calc(100% - 30px)' }}>
              <div
                className={`absolute bottom-0 w-full ${getBarColor(metric.levelOfCare)}`}
                style={{ height: `${percentage}%` }}
              ></div>
            </div>
            <div className="text-xs font-medium text-gray-500 mt-2">
              {metric.levelOfCare}
            </div>
            <div className="text-xs font-semibold text-gray-700">
              ${metric.averageAllowedAmount.toFixed(0)}
            </div>
          </div>
        );
      })}
    </div>
  );
}