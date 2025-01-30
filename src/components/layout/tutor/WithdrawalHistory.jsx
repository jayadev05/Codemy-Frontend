import { CalendarIcon, CheckCircle2, Clock, XCircle } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useMemo, useState } from 'react'
import Pagination from '@/components/utils/Pagination'

const statusStyles = {
  pending: {
    color: "text-yellow-500",
    bg: "bg-yellow-50",
    icon: Clock,
    label: "Pending",
  },
  approved: {
    color: "text-green-500",
    bg: "bg-green-50",
    icon: CheckCircle2,
    label: "Approved",
  },
  rejected: {
    color: "text-red-500",
    bg: "bg-red-50",
    icon: XCircle,
    label: "Rejected",
  },
}

export function WithdrawalHistory({ withdrawals = [] }) {

  const dataPerPage=5;
  const [page,setPage]=useState(1);

  const totalData = withdrawals.length;

  const paginatedWithdrawals = useMemo(() => {

    let startIndex = (page - 1) * dataPerPage;
    let endIndex = page * dataPerPage;

    return withdrawals.slice(startIndex, endIndex);

  }, [page, withdrawals]);

 


  return (
    <Card className="mb-12">
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Withdrawal History</CardTitle>
          <CardDescription>View all your withdrawal requests</CardDescription>
        </div>
        <Select defaultValue="all">
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Requests</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Payment Method</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedWithdrawals.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No withdrawal history to show
                </TableCell>
              </TableRow>
            ) : (
              paginatedWithdrawals.map((withdrawal) => {
                const status = statusStyles[withdrawal.status];
                const StatusIcon = status.icon;

                return (
                  <TableRow key={withdrawal._id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                        {new Date(withdrawal.requestedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      ₹{withdrawal.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="capitalize">
                      {withdrawal.paymentDetails?.paymentMethod}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`${status.bg} ${status.color} border-0`}
                      >
                        <StatusIcon className="mr-1 h-4 w-4" />
                        {status.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Pagination
        dataPerPage={dataPerPage}
        setCurrentPage={setPage}
        currentPage={page}
        totalData={totalData}
        className='justify-center my-5'
      />
    </Card>
  );
}

