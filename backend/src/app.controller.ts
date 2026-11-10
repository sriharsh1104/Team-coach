import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  // Pinged by an external uptime monitor / scheduled workflow to stop
  // Render's free tier from spinning the service down after 15 min idle.
  // Deliberately does not touch the DB — it only needs to prove the process
  // is alive and responsive.
  @Get('health')
  getHealth() {
    return { status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() };
  }
}
