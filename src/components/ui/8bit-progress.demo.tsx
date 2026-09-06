import { Progress } from '@/components/ui/8bit-progress'

export default function Default() {
  return (
    <div className="flex w-full min-h-screen items-center justify-center bg-background p-8 retro">
      <Progress value={62} className="w-80" />
    </div>
  )
}
