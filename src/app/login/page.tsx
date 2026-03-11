import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AppBrand } from "@/components/layout/app-brand";
import { getHomePathForRole } from "@/lib/auth";
import { isSmallStoreStrictMode } from "@/lib/runtime-flags";
import { getSessionUser } from "@/lib/session";

const loginErrors: Record<string, string> = {
  missing_fields: "Please enter both email and password.",
  invalid_credentials: "Invalid email or password.",
  invalid_role: "Please choose a valid role for Quick Login.",
  dev_only: "Quick Login is available only in development.",
  dev_user_missing:
    "Quick Login user not found. Run seed or check dev user env values.",
};

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    redirect(getHomePathForRole(sessionUser.role));
  }

  const params = await searchParams;
  const errorCode = params.error;
  const errorMessage = errorCode ? loginErrors[errorCode] : undefined;
  const isDev = process.env.NODE_ENV !== "production";
  const isSmallStoreStrict = isSmallStoreStrictMode();
  const ownerAdminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@smartpos.local";
  const managerEmail = process.env.SEED_MANAGER_EMAIL ?? "manager@smartpos.local";
  const salesEmail = process.env.SEED_SALES_EMAIL ?? "sales@smartpos.local";

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      <div className="hidden bg-muted lg:flex lg:flex-col lg:justify-between lg:p-10">
        <Link href="/login" className="w-fit">
          <AppBrand />
        </Link>

        <blockquote className="flex max-w-md flex-col gap-3">
          <p className="text-lg leading-relaxed text-foreground">
            &ldquo;This POS layout keeps checkout fast, inventory clear, and team handoffs
            consistent during every shift.&rdquo;
          </p>
          <footer className="text-sm text-muted-foreground">Sofia Davis</footer>
        </blockquote>
      </div>

      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="flex w-full max-w-sm flex-col gap-6">
          <Link
            href="/login"
            className="self-center lg:hidden"
          >
            <AppBrand />
          </Link>

          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-xl">Welcome back</CardTitle>
              <CardDescription>
                Enter your credentials to access your Smart POS dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form action="/api/auth/login" method="post" className="flex flex-col gap-6">
                <FieldGroup>
                  <Field>
                    <FieldLabel htmlFor="email">Email</FieldLabel>
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      placeholder="admin@smartpos.local"
                      required
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="password">Password</FieldLabel>
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Enter your password"
                      required
                    />
                  </Field>
                  {errorMessage ? (
                    <Field data-invalid>
                      <FieldError>{errorMessage}</FieldError>
                    </Field>
                  ) : null}
                  <Field>
                    <Button type="submit" className="w-full">
                      Sign in
                    </Button>
                  </Field>
                </FieldGroup>
              </form>

              {isDev ? (
                <div className="mt-6 flex flex-col gap-4">
                  <div className="relative h-5 text-sm">
                    <div className="absolute inset-0 top-1/2 border-t" />
                    <span className="relative mx-auto block w-fit bg-card px-2 text-muted-foreground">
                      Development
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <form action="/api/auth/dev-login" method="post">
                      <input type="hidden" name="role" value="OWNER" />
                      <Button type="submit" variant="outline" className="w-full">
                        Quick Owner/Admin
                      </Button>
                    </form>
                    <form action="/api/auth/dev-login" method="post">
                      <input type="hidden" name="role" value="MANAGER" />
                      <Button type="submit" variant="outline" className="w-full">
                        Quick Manager
                      </Button>
                    </form>
                    <form action="/api/auth/dev-login" method="post">
                      <input type="hidden" name="role" value="SALES" />
                      <Button type="submit" variant="outline" className="w-full">
                        Quick Sales
                      </Button>
                    </form>
                  </div>
                  <FieldDescription className="text-center">
                    Owner/Admin: <span className="font-medium">{ownerAdminEmail}</span>{" "}
                    <span className="text-muted-foreground/70">|</span> Manager:{" "}
                    <span className="font-medium">{managerEmail}</span>{" "}
                    <span className="text-muted-foreground/70">|</span> Sales:{" "}
                    <span className="font-medium">{salesEmail}</span>
                  </FieldDescription>
                  {isSmallStoreStrict ? (
                    <FieldDescription className="text-center">
                      Strict mode keeps the sales-first workflow.
                    </FieldDescription>
                  ) : null}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <FieldDescription className="px-6 text-center">
            By continuing, you agree to our <a href="#">Terms</a> and{" "}
            <a href="#">Privacy Policy</a>.
          </FieldDescription>
        </div>
      </div>
    </div>
  );
}
