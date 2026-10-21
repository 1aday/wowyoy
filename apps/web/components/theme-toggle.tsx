"use client"

import { useTheme } from "next-themes"
import { Moon, Sun } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Kbd } from "@workspace/ui/components/kbd"
import { Tooltip, TooltipContent, TooltipTrigger } from "@workspace/ui/components/tooltip"

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Toggle theme" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          <Sun className="size-4 dark:hidden" strokeWidth={1.5} />
          <Moon className="hidden size-4 dark:block" strokeWidth={1.5} />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Theme <Kbd>D</Kbd>
      </TooltipContent>
    </Tooltip>
  )
}
