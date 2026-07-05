import { motion } from 'motion/react';
import { useNavigate } from 'react-router';
import { ArrowLeft } from 'lucide-react';

export default function PrivacyPolicy() {
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
        <h1 className="text-lg font-semibold text-wa-text-primary">Privacy Policy</h1>
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
          <h2 className="text-base font-semibold text-wa-text-primary">1. Introduction</h2>
          <p>
            Veill ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
            explains how we collect, use, disclose, and safeguard your information when you use our
            end-to-end encrypted messaging application.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">2. End-to-End Encryption</h2>
          <p>
            All messages, calls, and media shared through Veill are protected with AES-256-GCM
            end-to-end encryption. This means your content is encrypted on your device and can only
            be decrypted by the intended recipient. We cannot read, access, or intercept the content
            of your messages or calls at any time.
          </p>
          <p>
            Encryption keys are generated and stored locally on your device. Your private keys never
            leave your device and are not accessible to us.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">3. Information We Collect</h2>
          <p>We collect minimal information necessary to provide the service:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Account Information:</strong> Email address, display name, and username used for authentication.</li>
            <li><strong>Profile Information:</strong> Profile picture and status message, which you choose to share.</li>
            <li><strong>Message Metadata:</strong> Timestamps, sender/recipient identifiers, and message status (sent, delivered, read) needed for message delivery. Message content is encrypted and not accessible to us.</li>
            <li><strong>Device Information:</strong> Device type and operating system for compatibility and push notifications.</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">4. How We Use Your Information</h2>
          <p>We use the collected information solely to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Provide, maintain, and improve the messaging service</li>
            <li>Authenticate your identity and manage your account</li>
            <li>Deliver messages, calls, and notifications</li>
            <li>Detect and prevent abuse, spam, and security incidents</li>
            <li>Comply with legal obligations</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">5. Data Storage and Security</h2>
          <p>
            Your data is stored on secure cloud infrastructure provided by Google Firebase. We employ
            industry-standard security measures including encryption in transit (TLS 1.3) and at rest.
            Locally stored data on your device is encrypted using AES-256-GCM.
          </p>
          <p>
            We use Firebase Authentication, Cloud Firestore, Realtime Database, and Cloud Storage
            services. These services comply with SOC 2, ISO 27001, and other security certifications.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">6. Third-Party Services</h2>
          <p>We use the following third-party services:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Google Firebase:</strong> Authentication, database, storage, and messaging</li>
            <li><strong>Sentry:</strong> Error monitoring and crash reporting (anonymous performance data only)</li>
            <li><strong>Capacitor:</strong> Native mobile platform integration</li>
          </ul>
          <p>
            These services may collect technical data as described in their respective privacy policies.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">7. Data Sharing</h2>
          <p>
            We do not sell, trade, or otherwise transfer your personal information to third parties.
            We may share information only in the following circumstances:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>With your explicit consent</li>
            <li>To comply with legal obligations or valid legal process</li>
            <li>To protect our rights, privacy, safety, or property</li>
            <li>In connection with a merger, acquisition, or sale of assets (with prior notice)</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">8. Data Retention</h2>
          <p>
            We retain your account information for as long as your account is active. Messages
            stored on our servers are retained until you delete them. Locally stored messages
            remain on your device until you clear them. When you delete your account, we
            permanently remove your data within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">9. Your Rights (GDPR)</h2>
          <p>If you are in the European Economic Area (EEA), you have the following rights:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Right of Access:</strong> Request a copy of your personal data</li>
            <li><strong>Right to Rectification:</strong> Request correction of inaccurate data</li>
            <li><strong>Right to Erasure:</strong> Request deletion of your personal data</li>
            <li><strong>Right to Portability:</strong> Request your data in a portable format</li>
            <li><strong>Right to Object:</strong> Object to processing of your personal data</li>
          </ul>
          <p>
            You can exercise these rights through the in-app data export feature in Settings,
            or by contacting us directly.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">10. Children's Privacy</h2>
          <p>
            Veill is not intended for children under 13 years of age. We do not knowingly collect
            personal information from children under 13.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. We will notify you of any
            material changes by posting the new policy in the app and updating the "Last updated" date.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-semibold text-wa-text-primary">12. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at{' '}
            <a href="mailto:privacy@quidec.io" className="text-wa-accent underline">
              privacy@quidec.io
            </a>
          </p>
        </section>
      </motion.div>
    </div>
  );
}
