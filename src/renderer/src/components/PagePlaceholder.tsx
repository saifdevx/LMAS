import { Construction } from 'lucide-react'
import { Badge } from './ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card'

interface PagePlaceholderProps {
  title: string
  checkpoint: number
  features: string[]
}

/** Clearly distinguishes planned modules from implemented ones (PRD §16.17). */
export function PagePlaceholder({ title, checkpoint, features }: PagePlaceholderProps) {
  return (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge tone="warning">
              <Construction className="mr-1 h-3 w-3" />
              Planned for Checkpoint {checkpoint}
            </Badge>
          </div>
          <CardDescription>
            This module is part of the approved implementation plan but has not been built yet. The current
            release is Checkpoint 1 (foundation).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-600">
            {features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  )
}
