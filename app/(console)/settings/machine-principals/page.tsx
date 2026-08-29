// input: authenticated console route and machine-principal settings component
// output: machine-principal administration page
// pos: Direct settings route for admin-only machine credential lifecycle
// note: if this file changes, update app/(console)/README.md.
import { MachinePrincipalSettings } from "@/components/settings/machine-principal-settings";

export default function MachinePrincipalsPage() {
  return <MachinePrincipalSettings />;
}
