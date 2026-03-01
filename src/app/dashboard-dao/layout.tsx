import { Metadata } from "next";

export const metadata: Metadata = {
  title: "NF Society — Dashboard DAO",
  description: "Vue d'ensemble du DAO NF Society : membres, trésorerie, contributions et distributions",
};

export default function DashboardDaoLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
