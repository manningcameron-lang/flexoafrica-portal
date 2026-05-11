import CustomerGuard from "@/components/CustomerGuard";

export default function JobsLayout({ children }) {
  return <CustomerGuard>{children}</CustomerGuard>;
}
