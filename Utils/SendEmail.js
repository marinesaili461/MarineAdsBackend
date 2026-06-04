import { Resend } from "resend";
import "dotenv/config";

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async (options) => {
  if (!options.email) throw new Error("Recipient email is required");

  try {
    const { data, error } = await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to: options.email,
      subject: options.subject,
      text: options.message,
      html: options.html || undefined,
    });

    if (error) throw new Error(error.message);

    console.log(`Email sent to ${options.email}`);
    return data;
  } catch (error) {
    console.error(`Email sending failed to ${options.email}:`, error.message);
    throw new Error("Email could not be sent");
  }
};

export default sendEmail;
