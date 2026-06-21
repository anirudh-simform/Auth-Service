import { Injectable, Logger } from '@nestjs/common';
import { createTransport } from 'nodemailer';
import { config } from 'src/config';
import Handlebars from 'handlebars';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private readonly transport = createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: false,
    auth: {
      user: config.SMTP_USER,
      pass: config.SMTP_PASS,
    },
  });
  constructor() {}

  async sendEmailVerificationLink(
    userEmail: string,
    verificationToken: string,
  ) {
    try {
      const templatePath = path.join(
        __dirname,
        'templates',
        'verification-email.hbs',
      );
      const emailVerficationTemplate = await readFile(templatePath, 'utf-8');
      const template = Handlebars.compile(emailVerficationTemplate);
      const emailString = template({
        verificationUrl: `${config.EMAIL_VERIFICATION_BASE_URL}?token=${verificationToken}`,
        userEmail: userEmail,
      });

      await this.transport.sendMail({
        from: 'auth.service@auth.com',
        to: userEmail,
        subject: 'Email Verification',
        html: emailString,
      });
    } catch (error: unknown) {
      this.logger.error(error);
      throw error;
    }
  }
}
