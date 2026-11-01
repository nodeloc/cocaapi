import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CocaAPI 账号",
  description: "CocaAPI 用户注册、登录和账号安全",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function Layout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
