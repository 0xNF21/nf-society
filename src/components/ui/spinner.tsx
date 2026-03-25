import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

function Spinner({ className, ...props }: React.SVGAttributes<SVGSVGElement>) {
  return (
    <Loader2
      className={cn("w-4 h-4 animate-spin motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export { Spinner };
