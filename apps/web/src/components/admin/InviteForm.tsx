import { Field } from '@/components/admin/Field';

export function InviteForm({
  action,
  patientId,
}: {
  action: (formData: FormData) => Promise<void>;
  patientId: string;
}) {
  return (
    <form action={action} className="space-y-3.5">
      <Field
        label="Their email"
        hint="They sign in with this address and see the log straight away."
        htmlFor="invite-email"
      >
        <input
          id="invite-email"
          name="email"
          type="email"
          placeholder="name@example.com"
          required
          className="cc-input"
        />
      </Field>

      <Field label="What can they do?" htmlFor="invite-role">
        <select id="invite-role" name="role" required className="cc-input">
          <option value="caregiver">Caregiver — can log care and see everything</option>
          <option value="viewer">Viewer — can read the log, but not add to it</option>
          <option value="admin">Admin — can also manage templates, schedules and people</option>
        </select>
      </Field>

      <input type="hidden" name="patientId" value={patientId} />
      <button type="submit" className="cc-btn cc-btn--primary">
        Send invite
      </button>
    </form>
  );
}
