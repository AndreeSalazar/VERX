import { asset } from '@veloz/kit'
export const metadata = { title: { default: 'Fixture', template: '%s | Fixture' } }
export const head = () => <link rel="stylesheet" href={asset('/a.css')} />
export default ({ children }) => <div id="root">{children}</div>
