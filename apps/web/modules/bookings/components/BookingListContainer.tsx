"use client";

import dayjs from "@calcom/dayjs";
import { useDataTable } from "~/data-table/hooks/useDataTable";
import { useLocale } from "@calcom/lib/hooks/useLocale";
import { trpc } from "@calcom/trpc/react";
import useMeQuery from "@calcom/trpc/react/hooks/useMeQuery";
import { Alert } from "@calcom/ui/components/alert";
import { Button } from "@calcom/ui/components/button";
import { getCoreRowModel, getSortedRowModel, useReactTable } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";
import { useBookingFilters } from "~/bookings/hooks/useBookingFilters";
import { useBookingListColumns } from "~/bookings/hooks/useBookingListColumns";
import { useBookingListData } from "~/bookings/hooks/useBookingListData";
import { useFacetedUniqueValues } from "~/bookings/hooks/useFacetedUniqueValues";
import { useListAutoSelector } from "~/bookings/hooks/useListAutoSelector";
import { useSwitchToCorrectStatusTab } from "~/bookings/hooks/useSwitchToCorrectStatusTab";
import {
  BookingDetailsSheetStoreProvider,
  useBookingDetailsSheetStore,
} from "../store/bookingDetailsSheetStore";
import type { BookingListingStatus, BookingsGetOutput, RowData } from "../types";
import { BookingDetailsSheet } from "./BookingDetailsSheet";
import { BookingList } from "./BookingList";
import { CreateManualBookingDialog } from "./CreateManualBookingDialog";
import { SalonDailySummary } from "./SalonDailySummary";
import { SalonGridView } from "./SalonGridView";
import type { StaffConfig, SalonDayBooking } from "./SalonGridView";
import { SalonMonthCalendar } from "./SalonMonthCalendar";
import { useBookingsView } from "../hooks/useBookingsView";

interface BookingListContainerProps {
  status: BookingListingStatus;
  permissions: {
    canReadOthersBookings: boolean;
  };
  bookingsV3Enabled: boolean;
  bookingAuditEnabled: boolean;
}

interface BookingListInnerProps extends BookingListContainerProps {
  data?: BookingsGetOutput;
  isPending: boolean;
  hasError: boolean;
  errorMessage?: string;
  totalRowCount?: number;
  bookings: BookingsGetOutput["bookings"];
}

/** Returns the Monday of the week containing `date` (Mon–Sat week). */
function getWeekMonday(date: dayjs.Dayjs): dayjs.Dayjs {
  const dow = date.day(); // 0=Sun, 1=Mon, …, 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow;
  return date.add(diff, "day").startOf("day");
}

function BookingListInner({
  status,
  permissions,
  bookings,
  bookingsV3Enabled,
  bookingAuditEnabled,
  data,
  isPending,
  hasError,
  errorMessage,
  totalRowCount,
}: BookingListInnerProps) {
  const { t } = useLocale();
  const user = useMeQuery().data;
  const setSelectedBookingUid = useBookingDetailsSheetStore((state) => state.setSelectedBookingUid);
  const [view] = useBookingsView({ bookingsV3Enabled });
  const [salonDate, setSalonDate] = useState(dayjs());
  const [salonSubView, setSalonSubView] = useState<"month" | "day">("month");
  const [calendarMonth, setCalendarMonth] = useState(() => dayjs().startOf("month"));
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editBooking, setEditBooking] = useState<SalonDayBooking | null>(null);
  const [createDialogDefaults, setCreateDialogDefaults] = useState<{
    hour?: number;
    minute?: number;
    staffUserId?: number;
    date?: dayjs.Dayjs;
  }>({});
  const [confirmDelete, setConfirmDelete] = useState<SalonDayBooking | null>(null);

  const utils = trpc.useUtils();
  const cancelMutation = trpc.viewer.bookings.cancelBooking.useMutation({
    onSuccess: () => {
      utils.viewer.bookings.getDayBookings.invalidate();
      setConfirmDelete(null);
    },
  });

  const { data: staffMembers } = trpc.viewer.bookings.listStaff.useQuery();

  // Week range for the summary (Mon–Sat of the current salonDate)
  const weekMonday = useMemo(() => getWeekMonday(salonDate), [salonDate]);
  const weekSaturday = useMemo(() => weekMonday.add(5, "day"), [weekMonday]);

  // Dedicated query for the salon day grid — fetches ALL bookings for the selected day only
  const { data: rawDayBookings } = trpc.viewer.bookings.getDayBookings.useQuery(
    { date: salonDate.format("YYYY-MM-DD") },
    {
      enabled: view === "salon" && salonSubView === "day",
      staleTime: 0,
    }
  );

  // Week-range query for the daily/weekly summary (Mon–Sat)
  const { data: rawWeekBookings } = trpc.viewer.bookings.getDayBookings.useQuery(
    {
      date: weekMonday.format("YYYY-MM-DD"),
      endDate: weekSaturday.format("YYYY-MM-DD"),
    },
    {
      enabled: view === "salon" && salonSubView === "day",
      staleTime: 0,
    }
  );

  // Month-range query for the calendar indicators
  const { data: rawMonthBookings } = trpc.viewer.bookings.getDayBookings.useQuery(
    {
      date: calendarMonth.format("YYYY-MM-DD"),
      endDate: calendarMonth.endOf("month").format("YYYY-MM-DD"),
    },
    {
      enabled: view === "salon" && salonSubView === "month",
      staleTime: 0,
    }
  );

  const salonDayBookings = useMemo<SalonDayBooking[]>(
    () => rawDayBookings ?? [],
    [rawDayBookings]
  );

  const salonWeekBookings = useMemo<SalonDayBooking[]>(
    () => rawWeekBookings ?? [],
    [rawWeekBookings]
  );

  const salonMonthBookings = useMemo<SalonDayBooking[]>(
    () => rawMonthBookings ?? [],
    [rawMonthBookings]
  );

  const salonStaff: StaffConfig[] = useMemo(() => {
    if (!staffMembers?.length) return [];
    return staffMembers.map((s, i) => ({
      id: s.id,
      name: s.name ?? s.email,
      color: s.name?.toLowerCase().includes("marielis")
        ? "pink"
        : s.name?.toLowerCase().includes("yasmary")
        ? "green"
        : (i % 2 === 0 ? "pink" : "green"),
    })) as StaffConfig[];
  }, [staffMembers]);

  useListAutoSelector(bookings);

  const ErrorView = errorMessage ? (
    <Alert severity="error" title={t("something_went_wrong")} message={errorMessage} />
  ) : undefined;

  const handleBookingClick = useCallback(
    (bookingUid: string) => {
      setSelectedBookingUid(bookingUid);
    },
    [setSelectedBookingUid]
  );

  const columns = useBookingListColumns({
    user,
    status,
    canReadOthersBookings: permissions.canReadOthersBookings,
    bookingsV3Enabled,
    handleBookingClick,
  });

  const finalData = useBookingListData({
    data,
    status,
    userTimeZone: user?.timeZone,
  });

  const getFacetedUniqueValues = useFacetedUniqueValues({
    canReadOthersBookings: permissions.canReadOthersBookings,
  });

  const table = useReactTable<RowData>({
    data: finalData,
    columns,
    initialState: {
      columnVisibility: {
        eventTypeId: false,
        teamId: false,
        userId: false,
        attendeeName: false,
        attendeeEmail: false,
        dateRange: false,
        bookingUid: false,
      },
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedUniqueValues,
  });

  function closeDialog(open: boolean) {
    setShowCreateDialog(open);
    if (!open) {
      setCreateDialogDefaults({});
      setEditBooking(null);
    }
  }

  return (
    <>
      <div className="flex justify-end">
        <Button
          color="primary"
          StartIcon="plus"
          size="sm"
          onClick={() => {
            setCreateDialogDefaults({ date: salonDate, hour: 8, minute: 0 });
            setEditBooking(null);
            setShowCreateDialog(true);
          }}>
          Crear cita
        </Button>
      </div>

      {view === "salon" ? (
        <div className="mt-4">
          {salonSubView === "month" ? (
            <SalonMonthCalendar
              bookings={salonMonthBookings}
              selectedDate={salonDate}
              viewMonth={calendarMonth}
              onViewMonthChange={(month) => {
                setCalendarMonth(month);
              }}
              onSelectDate={(date) => {
                setSalonDate(date);
                setCalendarMonth(date.startOf("month"));
                setSalonSubView("day");
              }}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => setSalonSubView("month")}
                className="mb-3 rounded-lg px-3 py-1.5 text-sm font-semibold text-[#B8860B] hover:bg-[#D4A01722]">
                ← Ver mes
              </button>
              <SalonGridView
                bookings={salonDayBookings}
                date={salonDate}
                onDateChange={setSalonDate}
                staff={salonStaff}
                onClickEmpty={(hour, minute, staffId) => {
                  setCreateDialogDefaults({ hour, minute, staffUserId: staffId, date: salonDate });
                  setEditBooking(null);
                  setShowCreateDialog(true);
                }}
                onClickBooking={(booking) => {
                  setEditBooking(booking);
                  setCreateDialogDefaults({});
                  setShowCreateDialog(true);
                }}
                onDeleteBooking={(booking) => setConfirmDelete(booking)}
              />
              <SalonDailySummary
                bookings={salonWeekBookings}
                staff={salonStaff}
                date={salonDate}
              />
            </>
          )}
        </div>
      ) : (
        <div className="mt-4">
          <BookingList
            status={status}
            table={table}
            isPending={isPending}
            totalRowCount={totalRowCount}
            ErrorView={ErrorView}
            hasError={hasError}
          />
        </div>
      )}

      {/* ── Confirmation dialog: delete booking ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <p className="mb-1 text-base font-black text-[#1A1A1A]">¿Eliminar esta cita?</p>
            <p className="mb-0.5 text-sm font-semibold text-gray-700">
              {confirmDelete.attendees?.[0]?.name ?? "Cliente"}
            </p>
            <p className="mb-5 text-xs text-gray-400">{confirmDelete.title}</p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={cancelMutation.isPending}
                onClick={() => cancelMutation.mutate({ uid: confirmDelete.uid })}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-60 active:scale-[0.98]">
                {cancelMutation.isPending ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      <CreateManualBookingDialog
        isOpenDialog={showCreateDialog}
        setIsOpenDialog={closeDialog}
        defaultStaffUserId={createDialogDefaults.staffUserId}
        defaultHour={createDialogDefaults.hour}
        defaultMinute={createDialogDefaults.minute}
        defaultDate={createDialogDefaults.date}
        editBooking={editBooking}
      />

      {bookingsV3Enabled && (
        <BookingDetailsSheet
          userTimeZone={user?.timeZone}
          userTimeFormat={user?.timeFormat === null ? undefined : user?.timeFormat}
          userId={user?.id}
          userEmail={user?.email}
          bookingAuditEnabled={bookingAuditEnabled}
        />
      )}
    </>
  );
}

export function BookingListContainer(props: BookingListContainerProps) {
  const { limit, offset, isValidatorPending } = useDataTable();
  const { eventTypeIds, teamIds, userIds, dateRange, attendeeName, attendeeEmail, bookingUid } =
    useBookingFilters();

  const { resolvedTabStatus, isResolvingTabStatus, preSelectedBooking } = useSwitchToCorrectStatusTab({
    defaultStatus: props.status,
  });

  const queryInput = useMemo(
    () => ({
      limit,
      offset,
      filters: {
        statuses: [resolvedTabStatus],
        eventTypeIds,
        teamIds,
        userIds,
        attendeeName,
        attendeeEmail,
        bookingUid,
        afterStartDate: dateRange?.startDate
          ? dayjs(dateRange?.startDate).startOf("day").toISOString()
          : undefined,
        beforeEndDate: dateRange?.endDate ? dayjs(dateRange?.endDate).endOf("day").toISOString() : undefined,
      },
    }),
    [
      limit,
      offset,
      resolvedTabStatus,
      eventTypeIds,
      teamIds,
      userIds,
      attendeeName,
      attendeeEmail,
      bookingUid,
      dateRange,
    ]
  );

  const query = trpc.viewer.bookings.get.useQuery(queryInput, {
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: !isValidatorPending && !isResolvingTabStatus,
  });

  const bookings = useMemo(() => {
    const queryBookings = query.data?.bookings ?? [];
    if (!preSelectedBooking) return queryBookings;
    if (queryBookings.some((b) => b.uid === preSelectedBooking.uid)) return queryBookings;
    return [...queryBookings, preSelectedBooking];
  }, [query.data?.bookings, preSelectedBooking]);

  return (
    <BookingDetailsSheetStoreProvider bookings={bookings}>
      <BookingListInner
        {...props}
        status={resolvedTabStatus}
        data={query.data}
        isPending={query.isPending}
        hasError={!!query.error}
        errorMessage={query.error?.message}
        totalRowCount={query.data?.totalCount}
        bookings={bookings}
      />
    </BookingDetailsSheetStoreProvider>
  );
}
