import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { LoggingInterceptor } from './common/interceptors/logging/logging.interceptor';
import { GlobalFilter } from './common/filters/global/global.filter';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger();
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000, () => {
    logger.log(`Nest application listening on port: ${config.PORT}`);
  });

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new GlobalFilter());
}
bootstrap();
