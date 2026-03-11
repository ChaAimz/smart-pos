import { Prisma, UserRole } from "@prisma/client";
import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { OwnerShell } from "@/components/layout/owner-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CardAction,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FlashToast } from "@/components/ui/flash-toast";
import { hashPassword } from "@/lib/auth";
import { requireOwnerSession } from "@/lib/owner-session";
import { prisma } from "@/lib/prisma";

type StaffPageProps = {
  searchParams: Promise<{
    dialog?: string;
    error?: string;
    status?: string;
  }>;
};

type StaffData = {
  dbStatus: "up" | "down";
  ownerCount: number;
  managerCount: number;
  salesCount: number;
  users: Array<{
    createdAt: Date;
    email: string;
    id: string;
    role: UserRole;
  }>;
};

const statusMessages: Record<string, string> = {
  role_updated: "Staff role updated.",
  staff_created: "Staff account created.",
};

const errorMessages: Record<string, string> = {
  duplicate_email: "Email already exists.",
  invalid_fields: "Please provide valid email, password (min 8 chars), and role.",
  invalid_role: "Invalid role value.",
  last_owner: "Cannot demote the last owner account.",
  user_not_found: "User not found.",
};

type StaffDialogMode = "new";

function normalizeRole(value: FormDataEntryValue | null): UserRole | null {
  const role = String(value ?? "")
    .trim()
    .toUpperCase();

  if (role === "OWNER" || role === "MANAGER" || role === "SALES") {
    return role;
  }

  return null;
}

async function createStaffAction(formData: FormData) {
  "use server";

  await requireOwnerSession();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const role = normalizeRole(formData.get("role"));

  const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!isValidEmail || password.length < 8 || !role) {
    redirect("/owner/staff?dialog=new&error=invalid_fields");
  }

  try {
    await prisma.user.create({
      data: {
        email,
        passwordHash: await hashPassword(password),
        role,
      },
      select: {
        id: true,
      },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      redirect("/owner/staff?dialog=new&error=duplicate_email");
    }

    throw error;
  }

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/staff");
  redirect("/owner/staff?status=staff_created");
}

async function updateStaffRoleAction(formData: FormData) {
  "use server";

  await requireOwnerSession();

  const userId = String(formData.get("userId") ?? "").trim();
  const nextRole = normalizeRole(formData.get("role"));
  if (!userId || !nextRole) {
    redirect("/owner/staff?error=invalid_role");
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!target) {
    redirect("/owner/staff?error=user_not_found");
  }

  if (target.role === nextRole) {
    redirect("/owner/staff?status=role_updated");
  }

  if (target.role === "OWNER" && nextRole !== "OWNER") {
    const ownerCount = await prisma.user.count({
      where: { role: "OWNER" },
    });

    if (ownerCount <= 1) {
      redirect("/owner/staff?error=last_owner");
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      role: nextRole,
    },
    select: {
      id: true,
    },
  });

  revalidatePath("/");
  revalidatePath("/owner");
  revalidatePath("/owner/staff");
  redirect("/owner/staff?status=role_updated");
}

async function getStaffData(): Promise<StaffData> {
  try {
    const [users, ownerCount, managerCount, salesCount] = await prisma.$transaction([
      prisma.user.findMany({
        orderBy: { createdAt: "asc" },
        select: {
          createdAt: true,
          email: true,
          id: true,
          role: true,
        },
      }),
      prisma.user.count({ where: { role: "OWNER" } }),
      prisma.user.count({ where: { role: "MANAGER" } }),
      prisma.user.count({ where: { role: "SALES" } }),
    ]);

    return {
      dbStatus: "up",
      ownerCount,
      managerCount,
      salesCount,
      users,
    };
  } catch {
    return {
      dbStatus: "down",
      ownerCount: 0,
      managerCount: 0,
      salesCount: 0,
      users: [],
    };
  }
}

const createdAtFormat = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

function toDialogMode(value: string | undefined): StaffDialogMode | null {
  if (value === "new") {
    return "new";
  }

  return null;
}

function buildStaffPageHref(input: {
  dialog?: StaffDialogMode | null;
}) {
  const params = new URLSearchParams();

  if (input.dialog) {
    params.set("dialog", input.dialog);
  }

  const search = params.toString();
  return search ? `/owner/staff?${search}` : "/owner/staff";
}

export default async function OwnerStaffPage({ searchParams }: StaffPageProps) {
  const sessionUser = await requireOwnerSession();
  const params = await searchParams;
  const data = await getStaffData();
  const dialogMode = toDialogMode(params.dialog);
  const openDialogHref = buildStaffPageHref({ dialog: "new" });
  const closeDialogHref = buildStaffPageHref({});

  const statusMessage = params.status ? statusMessages[params.status] : undefined;
  const errorMessage = params.error ? errorMessages[params.error] : undefined;

  return (
    <OwnerShell
      activeNav="staff"
      dbStatus={data.dbStatus}
      mainClassName="h-[calc(100dvh-3.5rem)] min-h-0 overflow-hidden"
      pageTitle="Staff"
      userEmail={sessionUser.email}
    >
      <FlashToast
        id={params.status ? `owner-staff-status:${params.status}` : undefined}
        message={statusMessage}
        variant="success"
      />
      <FlashToast
        id={params.error ? `owner-staff-error:${params.error}` : undefined}
        message={errorMessage}
        variant="error"
      />

      <div className="flex min-h-0 flex-1 flex-col gap-6">
        <section className="shrink-0 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Total Staff</CardDescription>
              <CardTitle className="text-3xl">{data.users.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Owner Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.ownerCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Manager Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.managerCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card className="py-4">
            <CardHeader>
              <CardDescription>Sales Accounts</CardDescription>
              <CardTitle className="text-3xl">{data.salesCount}</CardTitle>
            </CardHeader>
          </Card>
        </section>

        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="text-base">Staff Directory</CardTitle>
            <CardDescription>Change role per account from this table.</CardDescription>
            <CardAction>
              <Button asChild>
                <Link href={openDialogHref}>Create Staff Account</Link>
              </Button>
            </CardAction>
          </CardHeader>
          <div className="border-t" />
          <CardContent className="min-h-0 flex-1 overflow-hidden pt-4">
            <div className="h-full overflow-y-auto overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden md:table-cell">Created</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.users.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-6 text-center text-muted-foreground">
                        No staff accounts available.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.email}
                          {user.id === sessionUser.userId ? (
                            <Badge variant="outline" className="ml-2">
                              You
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              user.role === "OWNER"
                                ? "default"
                                : user.role === "MANAGER"
                                  ? "outline"
                                  : "secondary"
                            }
                          >
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden text-muted-foreground md:table-cell">
                          {createdAtFormat.format(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={updateStaffRoleAction} className="inline-flex gap-2">
                            <input type="hidden" name="userId" value={user.id} />
                            <Button
                              type="submit"
                              name="role"
                              value="OWNER"
                              size="sm"
                              variant={user.role === "OWNER" ? "default" : "outline"}
                              disabled={user.role === "OWNER"}
                            >
                              Set Owner
                            </Button>
                            <Button
                              type="submit"
                              name="role"
                              value="MANAGER"
                              size="sm"
                              variant={user.role === "MANAGER" ? "secondary" : "outline"}
                              disabled={user.role === "MANAGER"}
                            >
                              Set Manager
                            </Button>
                            <Button
                              type="submit"
                              name="role"
                              value="SALES"
                              size="sm"
                              variant={user.role === "SALES" ? "secondary" : "outline"}
                              disabled={user.role === "SALES"}
                            >
                              Set Sales
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {dialogMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/45 backdrop-blur-sm" />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-start justify-between gap-3 px-5 py-4">
              <div>
                <h2 className="text-lg font-semibold">Create Staff Account</h2>
                <p className="text-sm text-muted-foreground">
                  Add a new login and assign owner, manager, or sales role.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href={closeDialogHref}>Close</Link>
              </Button>
            </div>
            <div className="border-t" />
            <form action={createStaffAction} className="grid grid-cols-1 gap-3 p-5">
              <Input
                name="email"
                type="email"
                placeholder="staff@smartpos.local"
                required
              />
              <Input
                name="password"
                type="password"
                minLength={8}
                placeholder="Minimum 8 characters"
                required
              />
              <div className="flex flex-wrap justify-end gap-2">
                <Button asChild type="button" variant="outline">
                  <Link href={closeDialogHref}>Cancel</Link>
                </Button>
                <Button type="submit" name="role" value="SALES">
                  Create Sales
                </Button>
                <Button type="submit" name="role" value="MANAGER" variant="outline">
                  Create Manager
                </Button>
                <Button type="submit" name="role" value="OWNER" variant="secondary">
                  Create Owner
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </OwnerShell>
  );
}
