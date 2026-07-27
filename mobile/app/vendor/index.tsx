import ProtectedRoute from "@/components/ProtectedRoute";

export default function VendorDashboard() {
  return (
    <ProtectedRoute allowedRoles={["vendor"]}>
      {/* Vendor UI here */}
    </ProtectedRoute>
  );
}


