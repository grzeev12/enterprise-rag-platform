import { CreateOrganizationForm } from "@/components/forms/create-organization-form";

export default function NewOrganizationPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">New organization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Organizations are the hard tenant boundary for this SaaS platform.
        </p>
      </div>
      <CreateOrganizationForm />
    </div>
  );
}
