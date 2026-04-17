import { signUpAction } from "@/app/actions";
import { FormMessage, FormMessage as FormMessageType } from "@/components/form-message";
import { SubmitButton } from "@/components/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Link from "next/link";

export default async function Signup(props: {
  searchParams: Promise<FormMessageType>;
}) {
  const searchParams = await props.searchParams;
  if ("message" in searchParams) {
    return (
      <div className="flex items-center justify-center gap-2 py-4">
        <FormMessage message={searchParams} />
      </div>
    );
  }

  return (
    <form className="flex flex-col">
      <h1 className="text-2xl font-bold">Sign up</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Already have an account?{" "}
        <Link className="text-primary font-medium underline" href="/sign-in">
          Sign in
        </Link>
      </p>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <Label htmlFor="password">Password</Label>
        <Input
          type="password"
          name="password"
          placeholder="Your password"
          minLength={6}
          required
        />
        <SubmitButton formAction={signUpAction} pendingText="Signing up...">
          Sign up
        </SubmitButton>
        <FormMessage message={searchParams} />
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4">
        Check your email to confirm your account
      </p>
    </form>
  );
}
