import { Boxes, KeyRound, ListTree } from "lucide-react";
import { Logo } from "@/app/ui/logo";

const POINTS = [
  { icon: Boxes, text: "A catalog of documented APIs, all behind one gateway" },
  { icon: ListTree, text: "Endpoints, parameters and examples for every API" },
  { icon: KeyRound, text: "Keys and access tokens in a click" },
];

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Logo />
          {children}
        </div>
      </main>
      <aside className="hero-bg hidden flex-col justify-center gap-8 border-l border-border p-12 lg:flex">
        <div className="flex max-w-md flex-col gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">Build on your organisation&apos;s APIs</h2>
          <p className="text-muted">OpenGate is the self-service front door to WSO2 API Manager.</p>
        </div>
        <ul className="flex max-w-md flex-col gap-4">
          {POINTS.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3">
              <span className="icon-tile size-10">
                <Icon aria-hidden className="size-5" />
              </span>
              <span className="text-sm font-medium">{text}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
