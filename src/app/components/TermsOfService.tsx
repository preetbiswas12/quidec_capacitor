import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export default function TermsOfService() {
  const navigate = useNavigate();

  return (
    <div className="h-full w-full bg-wa-bg-main flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-wa-bg-secondary border-b border-wa-border">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft size={20} className="text-wa-text-primary" />
        </button>
        <h1 className="text-lg font-semibold text-wa-text-primary">Terms of Service</h1>
      </div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 overflow-y-auto px-5 py-6 space-y-6 text-sm text-wa-text-primary leading-relaxed"
      >
        <p className="text-wa-text-muted text-xs">
          Last updated: July 5, 2026
        </p>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">1. Acceptance of Terms</h2>
          <p>
            By accessing or using Veill ("the Service"), you agree to be bound by these Terms of
            Service. If you do not agree, do not use the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">2. Description of Service</h2>
          <p>
            Veill is an end-to-end encrypted messaging application that provides text messaging,
            voice calls, video calls, file sharing, and group communication features. All
            communication content is encrypted and cannot be accessed by us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">3. Account Registration</h2>
          <p>To use Veill, you must:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Be at least 13 years of age</li>
            <li>Provide accurate and complete registration information</li>
            <li>Maintain the security of your account credentials</li>
            <li>Notify us immediately of any unauthorized use of your account</li>
          </ul>
          <p>
            You are responsible for all activity that occurs under your account.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">4. Acceptable Use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Use the Service for any unlawful purpose or in violation of any applicable law</li>
            <li>Send spam, chain letters, or other unsolicited communications</li>
            <li>Impersonate any person or entity</li>
            <li>Interfere with or disrupt the Service or servers</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Transmit malware, viruses, or other harmful code</li>
            <li>Harvest or collect information about other users without their consent</li>
            <li>Use automated systems to access the Service without our written permission</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">5. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by Veill
            and are protected by copyright, trademark, and other intellectual property laws.
            You retain ownership of any content you create and share through the Service.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">6. User Content</h2>
          <p>
            You retain all rights to the messages, files, and media you share through Veill.
            Due to our end-to-end encryption, we cannot access, review, or moderate your content.
            You are solely responsible for the content you share.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">7. Privacy</h2>
          <p>
            Your use of the Service is also governed by our{' '}
            <span className="text-wa-accent cursor-pointer" onClick={() => navigate('/privacy')}>
              Privacy Policy
            </span>
            , which is incorporated into these Terms by reference.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">8. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND,
            WHETHER EXPRESS OR IMPLIED. WE DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO
            IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND
            NON-INFRINGEMENT.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">9. Limitation of Liability</h2>
          <p>
            IN NO EVENT SHALL VEILL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
            OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE. OUR TOTAL
            LIABILITY SHALL NOT EXCEED THE AMOUNT YOU HAVE PAID US IN THE TWELVE (12) MONTHS
            PRECEDING THE CLAIM.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">10. Termination</h2>
          <p>
            We may suspend or terminate your access to the Service at any time, with or without
            notice, for conduct that we determine violates these Terms or is harmful to other
            users, us, or third parties. You may terminate your account at any time through
            the Settings page.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">11. Governing Law</h2>
          <p>
            These Terms shall be governed by and construed in accordance with applicable law,
            without regard to conflict of law principles.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">12. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms at any time. We will notify you of
            material changes by posting the updated Terms in the app. Your continued use
            of the Service after changes constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">13. Contact Us</h2>
          <p>
            If you have questions about these Terms, please contact us at{' '}
            <a href="mailto:legal@quidec.io" className="text-wa-accent underline">
              legal@quidec.io
            </a>
          </p>
        </section>
      </motion.div>
    </div>
  );
}
