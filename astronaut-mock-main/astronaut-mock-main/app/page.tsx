import { redirect } from 'next/navigation'
import { HaloDashboard } from '@/components/halo-dashboard'

type PageProps = {
  searchParams: Promise<{ page?: string }>
}

export default async function Page({ searchParams }: PageProps) {
  const { page } = await searchParams

  if (page === 'yuki') return <HaloDashboard />

  redirect('/index.html')
}
