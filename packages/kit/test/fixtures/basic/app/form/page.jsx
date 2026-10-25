import { redirect } from '@veloz/kit'
export async function action({ form }) {
  if (form.go) redirect('/')
  return { echo: form.name }
}
export default ({ actionData }) => <p>eco: {actionData?.echo ?? 'nada'}</p>
