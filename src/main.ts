import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';
import { LoggingInterceptor } from './common/interceptors/logging/logging.interceptor';
import { GlobalFilter } from './common/filters/global/global.filter';
import { Logger, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger();
  const app = await NestFactory.create(AppModule);

  app.use(helmet());

  if (config.CORS_ORIGINS.length > 0) {
    app.enableCors({ origin: config.CORS_ORIGINS, credentials: true });
  } else {
    logger.warn(
      'CORS_ORIGINS is not set - cross-origin requests will be rejected by the browser',
    );
  }

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new GlobalFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  await app.listen(process.env.PORT ?? 3000, () => {
    logger.log(`Nest application listening on port: ${config.PORT}`);
  });
}
bootstrap();
