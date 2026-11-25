import QRCode from 'qrcode';
import { jsPDF } from 'jspdf';
import type { TicketBundle } from '../types/travel';

export async function generateTicketQrDataUrl(payload: string): Promise<string> {
  return await QRCode.toDataURL(payload, {
    width: 240,
    margin: 1,
    color: {
      dark: '#09090B',
      light: '#FAF7F0',
    },
  });
}

export async function downloadTicketPdf(ticket: TicketBundle): Promise<void> {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const qrDataUrl = await generateTicketQrDataUrl(ticket.booking.qrPayload);

  // Header bar (Obsidian + Gold)
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 595, 96, 'F');
  doc.setFillColor(212, 175, 55);
  doc.rect(0, 92, 595, 4, 'F');

  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.text(ticket.company?.companyName || 'JAY GOGA TRAVELS', 40, 44);

  doc.setTextColor(250, 247, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('SLEEPER COACH BOARDING PASS', 40, 66);

  doc.setFont('courier', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(212, 175, 55);
  doc.text(`PNR: ${ticket.booking.pnr}`, 410, 46);
  doc.setFontSize(10);
  doc.setTextColor(250, 247, 240);
  doc.text(`Status: ${ticket.booking.status.toUpperCase()}`, 410, 66);

  // Journey Details Box
  doc.setDrawColor(212, 175, 55);
  doc.setLineWidth(1);
  doc.rect(40, 116, 360, 128);

  doc.setTextColor(20, 20, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(`${ticket.route.origin}  ->  ${ticket.route.destination}`, 56, 144);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Coach: ${ticket.bus.name} (${ticket.bus.registrationNumber})`, 56, 166);
  doc.text(`Class: ${ticket.bus.coachType}`, 56, 182);
  doc.text(
    `Date: ${ticket.trip.journeyDate}   |   Dep: ${ticket.trip.departureTime}   |   Arr: ${ticket.trip.arrivalTime}`,
    56,
    198
  );
  doc.text(`Pickup: ${ticket.booking.pickupStop}`, 56, 214);
  doc.text(`Drop: ${ticket.booking.dropStop}`, 56, 230);

  // QR Box
  doc.addImage(qrDataUrl, 'PNG', 422, 116, 128, 128);

  // Passenger Manifest
  let y = 274;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PASSENGER MANIFEST', 40, y);
  y += 12;
  doc.setFillColor(243, 237, 224);
  doc.rect(40, y, 515, 22, 'F');
  doc.setFontSize(9);
  doc.text('BERTH', 52, y + 14);
  doc.text('PASSENGER NAME', 110, y + 14);
  doc.text('AGE / GENDER', 320, y + 14);
  doc.text('MOBILE', 430, y + 14);
  y += 28;

  doc.setFont('helvetica', 'normal');
  for (const pax of ticket.passengers) {
    doc.text(pax.berthNumber, 52, y + 8);
    doc.text(pax.fullName, 110, y + 8);
    doc.text(`${pax.age} / ${pax.gender.toUpperCase()}`, 320, y + 8);
    doc.text(pax.mobile, 430, y + 8);
    y += 22;
  }

  // Payment Summary
  y += 16;
  doc.setDrawColor(220, 220, 220);
  doc.line(40, y, 555, y);
  y += 22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('FARE & PAYMENT SUMMARY', 40, y);
  y += 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Channel: ${ticket.booking.bookingChannel.toUpperCase()}`, 40, y);
  doc.text(`Method: ${ticket.booking.paymentMethod.toUpperCase()}`, 200, y);
  doc.text(`Subtotal: Rs. ${ticket.booking.subtotalAmount}`, 380, y);
  y += 16;
  doc.text(`Discount: -Rs. ${ticket.booking.discountAmount}`, 380, y);
  y += 16;
  doc.text(`GST (5%): Rs. ${ticket.booking.taxAmount}`, 380, y);
  y += 18;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(`Total Paid: Rs. ${ticket.booking.totalAmount}`, 380, y);

  // Terms Footer
  y += 42;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(90, 90, 95);
  const terms =
    ticket.company?.cmsContent?.termsText ||
    'Please arrive 15 minutes before departure with valid ID proof.';
  doc.text(doc.splitTextToSize(`Boarding Note: ${terms}`, 515), 40, y);

  doc.save(`JayGogaTravels-${ticket.booking.pnr}.pdf`);
}

export function downloadAdminReportPdf(
  title: string,
  headers: string[],
  rows: Array<Array<string | number>>
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFillColor(9, 9, 11);
  doc.rect(0, 0, 595, 68, 'F');
  doc.setTextColor(212, 175, 55);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('JAY GOGA TRAVELS — OPERATIONS REPORT', 36, 32);
  doc.setTextColor(250, 247, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`${title} · Generated ${new Date().toLocaleString()}`, 36, 50);

  let y = 96;
  const colWidth = Math.floor(520 / Math.max(1, headers.length));
  doc.setFillColor(243, 237, 224);
  doc.rect(36, y, 523, 22, 'F');
  doc.setTextColor(20, 20, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  headers.forEach((h, idx) => {
    doc.text(String(h).slice(0, 18), 42 + idx * colWidth, y + 14);
  });
  y += 28;

  doc.setFont('helvetica', 'normal');
  for (const row of rows) {
    if (y > 780) {
      doc.addPage();
      y = 48;
    }
    row.forEach((cell, idx) => {
      doc.text(String(cell ?? '').slice(0, 22), 42 + idx * colWidth, y);
    });
    y += 18;
  }

  doc.save(`JayGoga-Report-${Date.now()}.pdf`);
}
