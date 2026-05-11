import CustomerGuard from "@/components/CustomerGuard";

export default function ProfileLayout({ children }) {
  return <CustomerGuard>{children}</CustomerGuard>;
}
