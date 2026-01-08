import { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import EarningsPageSkeleton from "./EarningsPageSkeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DollarSign, Wallet, BookOpen } from "lucide-react";
import { useGetInsEarningsQuery } from "@/services/instructor/earnings/earnings-ins-api";
import { InsEarningsDetail } from "@/types/instructor/earnings";
import { ErrorComponent } from "../commom/ErrorComponent";
import { Pagination } from "@/components/common/Pagination";
import { toast } from "sonner";

interface DateRange {
  from?: Date;
  to?: Date;
}

// Format currency helper function
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(amount);
};

export const EarningsPage = () => {
  const [page, setPage] = useState(0);
  const [size, setSize] = useState(10);
  const [sort, setSort] = useState("paidAt,desc");
  const [courses, setCourses] = useState<Set<{ id: string; title: string }>>(
    new Set()
  );
  const [courseId, setCourseId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  // Convert date range to proper format for API
  const dateFrom = dateRange?.from
    ? format(dateRange.from, "yyyy-MM-dd'T'00:00:00")
    : undefined;
  const dateTo = dateRange?.to
    ? format(dateRange.to, "yyyy-MM-dd'T'23:59:59")
    : undefined;

  // Fetch earnings data
  const { data, isLoading, isError, refetch } = useGetInsEarningsQuery({
    courseId,
    dateFrom,
    dateTo,
    page,
    size,
    sort,
  });

  // Reset pagination when filters change
  useEffect(() => {
    setPage(0);
  }, [dateRange, courseId, sort]);

  // Get courses for the select input
  useEffect(() => {
    if (data && data.earnings.content.length > 0 && courseId === undefined) {
      const courseMap = new Map<string, { id: string; title: string }>();

      data.earnings.content.forEach((earning) => {
        // Only add the course if it doesn't exist in the map
        if (!courseMap.has(earning.courseId)) {
          courseMap.set(earning.courseId, {
            id: earning.courseId,
            title: earning.courseTitle,
          });
        }
      });

      // Convert map values to a Set
      setCourses(new Set(courseMap.values()));
      return;
    }
  }, [data, courseId]);

  const getStatusColor = (status: string) => {
    if (status) {
      status = status.toUpperCase();
    }
    switch (status) {
      case "PAID":
        return "bg-emerald-600 text-white font-medium";
      case "PENDING":
        return "bg-warning text-warning-foreground";
      case "AVAILABLE":
        return "bg-blue-500 text-white";
      default:
        return "bg-secondary text-secondary-foreground";
    }
  };

  if (isLoading) {
    return <EarningsPageSkeleton />;
  }

  if (isError) {
    return <ErrorComponent onRetry={refetch} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">Earnings</h1>
            <p className="text-muted-foreground">
              Track your revenue and manage withdrawals
            </p>
          </div>
        </div>

        {/* Content when data is loaded */}
        {data && !isLoading && !isError && (
          <>
            {/* Stats Cards */}
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {/* Total Earnings */}
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Earnings
                  </CardTitle>
                  <DollarSign className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(data.summary.totalEarnings || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    All-time earnings
                  </p>
                </CardContent>
              </Card>

              {/* Paid Amount */}
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Paid Amount
                  </CardTitle>
                  <Wallet className="h-4 w-4 text-success" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCurrency(data.summary.paidAmount || 0)}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Amount received
                  </p>
                </CardContent>
              </Card>

              {/* Total Transactions */}
              <Card className="shadow-card">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Transactions
                  </CardTitle>
                  <BookOpen className="h-4 w-4 text-instructor-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {data.summary.totalTransactions}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Completed sales
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            {courses.size > 0 && (
              <Card className="mb-6 gap-2">
                <CardHeader>
                  <CardTitle className="text-lg">Filter Earnings</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
                    {/* Course filter */}
                    <div className="col-span-2 space-y-2">
                      <Label>Course</Label>
                      <Select
                        value={courseId ? courseId : "all"}
                        onValueChange={(value) =>
                          setCourseId(value !== "all" ? value : undefined)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="All courses" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All courses</SelectItem>
                          {Array.from(courses).map((course) => (
                            <SelectItem key={course.id} value={course.id}>
                              {course.title}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* From date */}
                    <div className="space-y-2">
                      <Label>From Date</Label>
                      <Input
                        type="date"
                        value={
                          dateRange?.from
                            ? format(dateRange.from, "yyyy-MM-dd")
                            : ""
                        }
                        onChange={(e) => {
                          // Check if from date is after to date
                          const toDate = dateRange?.to
                            ? new Date(dateRange.to)
                            : undefined;
                          const fromDate = e.target.value
                            ? new Date(e.target.value)
                            : undefined;

                          if (fromDate && toDate && fromDate > toDate) {
                            toast.error(
                              "'From Date' cannot be later than 'To Date'"
                            );
                            return;
                          }

                          setDateRange((prev) => ({
                            from: fromDate,
                            to: prev?.to,
                          }));
                        }}
                      />
                    </div>

                    {/* To date */}
                    <div className="space-y-2">
                      <Label>To Date</Label>
                      <Input
                        type="date"
                        value={
                          dateRange?.to
                            ? format(dateRange.to, "yyyy-MM-dd")
                            : ""
                        }
                        onChange={(e) => {
                          // Check if to date is after from date
                          const fromDate = dateRange?.from
                            ? new Date(dateRange.from)
                            : undefined;

                          const toDate = e.target.value
                            ? new Date(e.target.value)
                            : undefined;

                          if (fromDate && toDate && toDate < fromDate) {
                            toast.error(
                              "'To Date' cannot be earlier than 'From Date'"
                            );
                            return;
                          }

                          setDateRange((prev) => ({
                            from: prev?.from,
                            to: toDate,
                          }));
                        }}
                      />
                    </div>

                    {/* Sort filter */}
                    <div className="space-y-2">
                      <Label>Sort By</Label>
                      <Select
                        value={sort}
                        onValueChange={(value) => setSort(value)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Sort by" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="paidAt,desc">
                            Latest Date
                          </SelectItem>
                          <SelectItem value="paidAt,asc">
                            Oldest Date
                          </SelectItem>
                          <SelectItem value="amount,desc">
                            Highest Amount
                          </SelectItem>
                          <SelectItem value="amount,asc">
                            Lowest Amount
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="mt-6">
                      {/* Clear filters */}
                      <Button
                        variant="outline"
                        onClick={() => {
                          setCourseId(undefined);
                          setDateRange(undefined);
                          setSort("paidAt,desc");
                        }}
                      >
                        Clear Filters
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {data && (
        <>
          {/* Earnings Table */}
          <Card>
            <CardHeader>
              <CardTitle>Earnings History</CardTitle>
              <CardDescription>
                Your course earnings and payment status
              </CardDescription>
            </CardHeader>

            <CardContent>
              {data.earnings.content.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8">
                  <Wallet className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-semibold mb-2">No earnings yet</p>
                  <p className="text-muted-foreground text-center max-w-md mb-4">
                    When you start selling courses, your earnings will appear
                    here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="relative overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase bg-muted/50">
                        <tr>
                          <th
                            scope="col"
                            className="px-4 py-3 text-center w-12"
                          >
                            No.
                          </th>
                          <th scope="col" className="px-4 py-3 text-left">
                            Course
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Amount
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Platform Cut
                          </th>
                          <th scope="col" className="px-4 py-3 text-right">
                            Your Share
                          </th>
                          <th scope="col" className="px-4 py-3 text-center">
                            Status
                          </th>
                          <th scope="col" className="px-4 py-3 text-center">
                            Date
                          </th>
                        </tr>
                      </thead>

                      <tbody>
                        {data.earnings.content.map(
                          (earning: InsEarningsDetail, index: number) => (
                            <tr key={earning.id} className="border-b">
                              <td className="px-4 py-4 text-center font-medium">
                                {page * size + index + 1}
                              </td>
                              <td className="px-4 py-4">
                                <div className="flex items-center space-x-3">
                                  <div className="h-10 w-10 rounded bg-muted">
                                    {earning.courseThumbnailUrl && (
                                      <img
                                        src={earning.courseThumbnailUrl}
                                        alt={earning.courseTitle}
                                        className="h-full w-full object-cover rounded"
                                      />
                                    )}
                                  </div>
                                  <div>
                                    <p className="font-medium">
                                      {earning.courseTitle}
                                    </p>
                                    <p className="text-xs text-muted-foreground">
                                      ID: {earning.paymentId}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-right font-medium">
                                {formatCurrency(earning.amount)}
                              </td>
                              <td className="px-4 py-4 text-right text-muted-foreground">
                                {formatCurrency(earning.platformCut)}
                              </td>
                              <td className="px-4 py-4 text-right font-medium">
                                {formatCurrency(earning.instructorShare)}
                              </td>
                              <td className="px-4 py-4 text-center">
                                <Badge
                                  className={getStatusColor(earning.status)}
                                >
                                  {earning.status}
                                </Badge>
                              </td>
                              <td className="px-4 py-4 text-right text-muted-foreground">
                                {format(
                                  new Date(earning.paidAt),
                                  "MMM d, yyyy"
                                )}
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {data.earnings.page.totalPages > 0 && (
                    <Pagination
                      currentPage={page}
                      itemsPerPage={size}
                      onPageChange={(page) => setPage(page)}
                      onItemsPerPageChange={(size) => setSize(size)}
                      pageInfo={data.earnings.page}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};
