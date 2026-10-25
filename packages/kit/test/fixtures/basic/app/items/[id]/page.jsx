import { notFound } from '@veloz/kit'
export const generateStaticParams = () => [{ id: '1' }, { id: '2' }]
export const generateMetadata = ({ params }) => ({ title: `Item ${params.id}` })
export default ({ params }) => {
  if (Number(params.id) > 10) notFound()
  return <p>item {params.id}</p>
}
