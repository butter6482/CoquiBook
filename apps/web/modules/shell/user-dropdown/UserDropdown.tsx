import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import classNames from "@calcom/ui/classNames";
import { Avatar } from "@calcom/ui/components/avatar";
import { ChevronDownIcon, ChevronUpIcon, LogOutIcon } from "@coss/ui/icons";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "@coss/ui/components/menu";
import { signOut } from "next-auth/react";
import { useState } from "react";

interface UserDropdownProps {
  small?: boolean;
}

export function UserDropdown({ small }: UserDropdownProps) {
  const { data: user, isPending } = useMeQuery();
  const [menuOpen, setMenuOpen] = useState(false);

  if (!user && !isPending) return null;

  return (
    <Menu open={menuOpen} onOpenChange={setMenuOpen}>
      <MenuTrigger
        disabled={isPending}
        render={
          <button
            data-testid="user-dropdown-trigger-button"
            className={classNames(
              "hover:bg-emphasis todesktop:!bg-transparent group mx-0 flex w-full cursor-pointer appearance-none items-center rounded-full text-left outline-none transition focus:outline-none focus:ring-0 md:rounded-none lg:rounded",
              small ? "p-2" : "px-2 py-1.5"
            )}
          />
        }>
        <span
          className={classNames(
            small ? "h-4 w-4" : "h-5 w-5 ltr:mr-2 rtl:ml-2",
            "relative shrink-0 rounded-full"
          )}>
          <Avatar
            size={small ? "xs" : "xsm"}
            imageSrc={user?.avatarUrl ?? user?.avatar}
            alt={user?.username ? `${user.username} Avatar` : "Nameless User Avatar"}
            className="overflow-hidden"
          />
          <span
            className={classNames(
              "border-muted absolute -bottom-1 -right-1 rounded-full border bg-green-500",
              small ? "-bottom-0.5 -right-0.5 h-2.5 w-2.5" : "-bottom-0.5 right-0 h-2 w-2"
            )}
          />
        </span>
        {!small && (
          <span className="flex grow items-center gap-2">
            <span className="w-24 shrink-0 text-sm leading-none">
              <span className="text-emphasis block truncate py-0.5 font-medium leading-normal">
                {isPending ? "Loading..." : (user?.name ?? "Nameless User")}
              </span>
            </span>
            {menuOpen ? (
              <ChevronUpIcon
                className="group-hover:text-subtle text-muted h-4 w-4 shrink-0 transition rtl:mr-4"
                aria-hidden="true"
              />
            ) : (
              <ChevronDownIcon
                className="group-hover:text-subtle text-muted h-4 w-4 shrink-0 transition rtl:mr-4"
                aria-hidden="true"
              />
            )}
          </span>
        )}
      </MenuTrigger>

      <MenuPopup align="start">
        <MenuItem
          variant="destructive"
          onClick={() => {
            signOut({ callbackUrl: "/auth/logout" });
          }}>
          <LogOutIcon />
          Cerrar sesión
        </MenuItem>
      </MenuPopup>
    </Menu>
  );
}
