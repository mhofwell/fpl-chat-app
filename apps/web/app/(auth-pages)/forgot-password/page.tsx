import { forgotPasswordAction } from "@/app/actions";
import { FormMessage, FormMessage as FormMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function ForgotPassword(props: {
  searchParams: Promise<FormMessageType>;
}) {
  const searchParams = await props.searchParams;
  return (
    <form className="flex flex-col">
      <h1 className="text-2xl font-bold">Reset Password</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Remember your password?{" "}
        <Link className="text-primary font-medium underline" href="/sign-in">
          Sign in
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <SubmitButton formAction={forgotPasswordAction}>
          Reset Password
        </SubmitButton>
        <FormMessage message={searchParams} />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Check your email for a reset link
      </p>
    </form>
  );
}
