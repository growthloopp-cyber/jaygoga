import { useEffect, useState } from 'react';
import { Download, Printer, X } from 'lucide-react';
import type { TicketBundle } from '../types/travel';
import { downloadTicketPdf, generateTicketQrDataUrl } from '../utils/ticketPdf';

interface TicketModalProps {
  ticket: TicketBundle | null;
  onClose: () => void;
}

export function TicketModal({ ticket, onClose }: TicketModalProps) {
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    if (!ticket) return;
    generateTicketQrDataUrl(ticket.booking.qrPayload)
      .then(setQrUrl)
      .catch(() => setQrUrl(''));
  }, [ticket]);

  if (!ticket) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Boarding Pass Ticket"
    >
      <div className="w-full max-w-2xl rounded-xl border border-[#D4AF37]/40 bg-[#FAF7F0] text-[#09090B] overflow-hidden my-8">
        {/* Header */}
        <div className="bg-[#09090B] text-[#FAF7F0] px-6 py-5 border-b-2 border-[#D4AF37] flex items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-widest text-[#D4AF37]">
              {ticket.company?.companyName || 'Jay Goga Travels'}
            </p>
            <h3 className="font-display text-2xl font-bold text-[#FAF7F0]">
              Sleeper Boarding Pass
            </h3>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-[11px] text-[#FAF7F0]/60">PNR Number</p>
              <p className="font-mono-tabular text-lg font-bold text-[#D4AF37]" data-testid="ticket-pnr">
                {ticket.booking.pnr}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close ticket modal"
              className="p-2 rounded-lg text-[#FAF7F0]/70 hover:text-[#FAF7F0] hover:bg-white/10 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          <div className="flex flex-col sm:flex-row justify-between gap-5 border-b border-[#09090B]/10 pb-5">
            <div className="space-y-2 flex-1">
              <div className="text-xs text-[#09090B]/60">
                {ticket.trip.journeyDate} · {ticket.bus.coachType} · {ticket.booking.status.toUpperCase()}
              </div>
              <div className="font-display text-2xl font-bold text-[#09090B]">
                {ticket.route.origin} to {ticket.route.destination}
              </div>
              <div className="text-sm text-[#09090B]/80">
                {ticket.bus.name} ({ticket.bus.registrationNumber})
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2 text-xs">
                <div>
                  <span className="block text-[#09090B]/55">Departure & Pickup</span>
                  <span className="font-mono-tabular font-semibold">{ticket.trip.departureTime}</span>{' '}
                  · {ticket.booking.pickupStop}
                </div>
                <div>
                  <span className="block text-[#09090B]/55">Arrival & Drop</span>
                  <span className="font-mono-tabular font-semibold">{ticket.trip.arrivalTime}</span>{' '}
                  · {ticket.booking.dropStop}
                </div>
              </div>
            </div>

            <div className="shrink-0 flex flex-col items-center justify-center rounded-lg border border-[#09090B]/15 bg-white p-2.5">
              {qrUrl ? (
                <img src={qrUrl} alt={`QR code for PNR ${ticket.booking.pnr}`} className="w-28 h-28" />
              ) : (
                <div className="w-28 h-28 flex items-center justify-center text-xs text-neutral-500">
                  Generating QR
                </div>
              )}
              <span className="mt-1 font-mono-tabular text-[10px] text-[#09090B]/60">
                Scan at Boarding
              </span>
            </div>
          </div>

          {/* Passengers */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[#09090B]/60 mb-2">
              Passengers & Berths
            </h4>
            <div className="overflow-x-auto border border-[#09090B]/10 rounded-lg bg-white">
              <table className="w-full text-sm">
                <thead className="bg-[#F3EDE0] text-left text-xs text-[#09090B]/70">
                  <tr>
                    <th className="py-2 px-3">Berth</th>
                    <th className="py-2 px-3">Full Name</th>
                    <th className="py-2 px-3">Age / Gender</th>
                    <th className="py-2 px-3">Mobile</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#09090B]/10">
                  {ticket.passengers.map((p) => (
                    <tr key={p.id}>
                      <td className="py-2 px-3 font-mono-tabular font-semibold text-[#B4861C]">
                        {p.berthNumber}
                      </td>
                      <td className="py-2 px-3 font-medium">{p.fullName}</td>
                      <td className="py-2 px-3 text-xs capitalize">
                        {p.age} yrs · {p.gender}
                      </td>
                      <td className="py-2 px-3 font-mono-tabular text-xs">{p.mobile}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Fare & Actions */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-[#09090B]/10 pt-4">
            <div className="text-sm space-y-0.5">
              <div className="text-xs text-[#09090B]/60">
                Channel: {ticket.booking.bookingChannel.toUpperCase()} · Payment:{' '}
                {ticket.booking.paymentStatus.toUpperCase()} ({ticket.booking.paymentMethod})
              </div>
              <div className="font-mono-tabular text-lg font-bold">
                Total Paid: Rs. {ticket.booking.totalAmount}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#09090B]/20 text-sm font-medium hover:bg-[#09090B]/5 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                type="button"
                onClick={() => downloadTicketPdf(ticket)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#09090B] text-[#D4AF37] text-sm font-semibold hover:bg-[#18181D] cursor-pointer whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
