import { redirect } from "next/navigation";
import { supabaseServer } from "@/server/supabase";
import { ConsentForm } from "./ui";
export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ authorization_id?: string }>;
}) {
  const { authorization_id } = await searchParams;
  if (!authorization_id) return <p>Missing authorization request.</p>;
  const client = await supabaseServer(),
    { data: user } = await client.auth.getUser();
  if (!user.user)
    redirect(
      "/auth/login?next=" +
        encodeURIComponent(
          "/oauth/consent?authorization_id=" + authorization_id,
        ),
    );
  const { data, error } =
    await client.auth.oauth.getAuthorizationDetails(authorization_id);
  if (error || !data)
    return <p>Authorization request is invalid or expired.</p>;
  if ("redirect_url" in data) redirect(data.redirect_url);
  return (
    <ConsentForm
      authorizationId={authorization_id}
      clientName={data.client.name}
    />
  );
}
