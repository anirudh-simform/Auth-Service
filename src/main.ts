import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { config } from './config';
import { LoggingInterceptor } from './common/interceptors/logging/logging.interceptor';
import { GlobalFilter } from './common/filters/global/global.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);

  app.useGlobalInterceptors(new LoggingInterceptor());
  app.useGlobalFilters(new GlobalFilter());
}
bootstrap();
