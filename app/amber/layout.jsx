import CustomerGuard from "@/components/CustomerGuard";

export default function AmberLayout({ children }) {
  return <CustomerGuard>{children}</CustomerGuard>;
}
