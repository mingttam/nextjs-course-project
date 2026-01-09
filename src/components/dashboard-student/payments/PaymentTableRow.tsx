"use client";
import React, { useState } from "react";
import { TableCell, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import {
  useGetPaymentDetailQuery,
  useGetCourseProgressQuery,
} from "@/services/student/studentApi";
import { RefundDialog } from "./RefundDialog";
import type { Payment } from "@/types/student";
import Image from "next/image";
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  FileText,
  Hash,
  Calendar,
  AlertCircle,
  ExternalLink,
  Undo2,
} from "lucide-react";
import {
  formatCurrency,
  formatDate,
  getPaymentMethodDisplay,
  getPaymentStatusBadge,
} from "@/utils/student";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface PaymentTableRowProps {
  payment: Payment;
}

export function PaymentTableRow({ payment }: PaymentTableRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);

  // Only fetch payment detail when the row is expanded
  const {
    data: paymentDetail,
    isLoading: isDetailLoading,
    error: detailError,
  } = useGetPaymentDetailQuery(payment.id, {
    skip: !isExpanded, // Don't fetch unless expanded
  });

  // Fetch course progress to check completion percentage
  const {
    data: courseProgress,
    isLoading: isProgressLoading,
    error: progressError,
  } = useGetCourseProgressQuery(payment.course.id, {
    skip: payment.status !== "COMPLETED", // Only fetch if payment is completed
  });

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  // Calculate if refund is still allowed (within 3 days and course completion < 30%)
  const isRefundAllowed = () => {
    // Check if payment is completed
    if (payment.status !== "COMPLETED") {
      return false;
    }

    // Check if within 3 days of purchase
    const paymentDate = new Date(payment.createdAt);
    const currentDate = new Date();
    const diffInDays = Math.floor(
      (currentDate.getTime() - paymentDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    const isWithin3Days = diffInDays <= 3;

    // Check if course completion is less than or equal to 30% (0.3 as decimal)
    const courseCompletionPercentage = courseProgress?.summary?.percentage || 0;
    // Convert percentage to decimal for comparison (percentage / 100)
    const completionAsDecimal = courseCompletionPercentage / 100;
    const isCompletionUnder30Percent = completionAsDecimal <= 0.3;

    return isWithin3Days && isCompletionUnder30Percent;
  };

  const canRefund = isRefundAllowed();

  return (
    <>
      {/* Main Table Row */}
      <TableRow className={cn(isExpanded && "border-b-0")}>
        {/* Course Thumbnail */}
        <TableCell>
          <div className="relative w-12 h-8 rounded overflow-hidden bg-gray-100">
            <Image
              src={payment.course.thumbnailUrl}
              alt={payment.course.title}
              fill
              className="object-cover"
              sizes="48px"
            />
          </div>
        </TableCell>

        {/* Course Title */}
        <TableCell>
          <div className="font-medium line-clamp-2 max-w-xs">
            {payment.course.title}
          </div>
        </TableCell>

        {/* Amount */}
        <TableCell className="text-right font-medium">
          <div className="whitespace-nowrap">
            {formatCurrency(payment.amount, payment.currency)}
          </div>
        </TableCell>

        {/* Payment Method */}
        <TableCell>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {getPaymentMethodDisplay(payment.paymentMethod)}
          </span>
        </TableCell>

        {/* Date */}
        <TableCell>
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            {formatDate(payment.createdAt)}
          </span>
        </TableCell>

        {/* Status */}
        <TableCell className="text-center">
          {getPaymentStatusBadge(payment.status)}
        </TableCell>

        {/* Expand/Collapse Button */}
        <TableCell>
          <Button
            variant="ghost"
            size="sm"
            onClick={toggleExpanded}
            className="h-8 w-8 p-0"
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </TableCell>
      </TableRow>

      {/* Expanded Detail Row */}
      {isExpanded && (
        <TableRow>
          <TableCell colSpan={7} className="p-0">
            <div className="bg-gray-50 border-t border-gray-200 p-3 md:p-4">
              {isDetailLoading && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-4" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="space-y-1">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {detailError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-sm">
                    Failed to load payment details. Please try again.
                  </AlertDescription>
                </Alert>
              )}

              {paymentDetail && !isDetailLoading && (
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-gray-900 flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Payment Details
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
                    {/* Transaction ID */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Hash className="h-3 w-3 text-gray-400" />
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Transaction ID
                        </span>
                      </div>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <p className="text-sm text-gray-900 font-mono overflow-hidden text-ellipsis">
                            {paymentDetail.transactionId}
                          </p>
                        </TooltipTrigger>
                        <TooltipContent>
                          {paymentDetail.transactionId}
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    {/* Stripe Session ID */}
                    {paymentDetail.stripeSessionId && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <Hash className="h-3 w-3 text-gray-400" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Session ID
                          </span>
                        </div>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <p className="text-sm text-gray-900 font-mono overflow-hidden text-ellipsis">
                              {paymentDetail.stripeSessionId}
                            </p>
                          </TooltipTrigger>
                          <TooltipContent>
                            {paymentDetail.stripeSessionId}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    )}

                    {/* Card Information */}
                    {paymentDetail.card && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <CreditCard className="h-3 w-3 text-gray-400" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Card Info
                          </span>
                        </div>
                        <p className="text-sm text-gray-900">
                          •••• {paymentDetail.card.last4} (
                          {paymentDetail.card.brand.toUpperCase()})
                        </p>
                        <p className="text-xs text-gray-500">
                          Expires{" "}
                          {paymentDetail.card.expMonth
                            .toString()
                            .padStart(2, "0")}
                          /{paymentDetail.card.expYear}
                        </p>
                      </div>
                    )}

                    {/* Receipt URL */}
                    {paymentDetail.receiptUrl && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3 text-gray-400" />
                          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                            Receipt
                          </span>
                        </div>
                        <a
                          href={paymentDetail.receiptUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                        >
                          View Receipt
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </div>
                    )}

                    {/* Created Date (Full) */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-gray-400" />
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Created
                        </span>
                      </div>
                      <p className="text-sm text-gray-900">
                        {new Intl.DateTimeFormat("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }).format(new Date(paymentDetail.createdAt))}
                      </p>
                    </div>

                    {/* Payment Method Detail */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1">
                        <CreditCard className="h-3 w-3 text-gray-400" />
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                          Payment Method
                        </span>
                      </div>
                      <p className="text-sm text-gray-900">
                        {getPaymentMethodDisplay(paymentDetail.paymentMethod)}
                      </p>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {payment.status === "COMPLETED" && (
                    <div className="mt-4 pt-4 border-t border-gray-200">
                      <div className="flex justify-end">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setIsRefundDialogOpen(true)}
                          disabled={!canRefund || isProgressLoading}
                          className={cn(
                            canRefund && !isProgressLoading
                              ? "text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
                              : "text-gray-400 border-gray-200 cursor-not-allowed opacity-50"
                          )}
                        >
                          <Undo2 className="h-4 w-4 mr-2" />
                          {isProgressLoading ? "Checking..." : "Request Refund"}
                        </Button>
                      </div>
                      <div className="text-xs text-gray-500 mt-2 text-right space-y-1">
                        <p>
                          Refunds must be requested within 3 days of purchase
                        </p>
                        <p>and course completion must be 30% or less</p>
                        {!canRefund && courseProgress && (
                          <p className="text-red-500 font-medium">
                            {(() => {
                              const paymentDate = new Date(payment.createdAt);
                              const currentDate = new Date();
                              const diffInDays = Math.floor(
                                (currentDate.getTime() -
                                  paymentDate.getTime()) /
                                  (1000 * 60 * 60 * 24)
                              );
                              const isWithin3Days = diffInDays <= 3;
                              const courseCompletionPercentage =
                                courseProgress.summary?.percentage || 0;
                              const completionAsDecimal =
                                courseCompletionPercentage / 100;
                              const isCompletionUnder30Percent =
                                completionAsDecimal <= 0.3;

                              if (
                                !isWithin3Days &&
                                !isCompletionUnder30Percent
                              ) {
                                return `Refund not available: ${diffInDays} days since purchase, ${courseCompletionPercentage.toFixed(
                                  1
                                )}% completed`;
                              } else if (!isWithin3Days) {
                                return `Refund not available: ${diffInDays} days since purchase (max 3 days)`;
                              } else if (!isCompletionUnder30Percent) {
                                return `Refund not available: ${courseCompletionPercentage.toFixed(
                                  1
                                )}% completed (max 30%)`;
                              }
                              return "Refund not available";
                            })()}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}

      {/* Refund Dialog */}
      <RefundDialog
        isOpen={isRefundDialogOpen}
        onClose={() => setIsRefundDialogOpen(false)}
        payment={payment}
      />
    </>
  );
}
