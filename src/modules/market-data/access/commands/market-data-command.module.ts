import { Module } from '@nestjs/common';
import { MarketDataApplicationModule } from '../../application/market-data-application.module';
import { PtaxAfternoonCommand, PtaxAfternoonTickHandler } from './ptax-afternoon.command';
import { QuotesSweepCommand, QuotesSweepTickHandler } from './quotes-sweep.command';
import { ReferenceDailyCommand, ReferenceDailyTickHandler } from './reference-daily.command';

@Module({
    imports: [MarketDataApplicationModule],
    providers: [
        QuotesSweepCommand,
        QuotesSweepTickHandler,
        ReferenceDailyCommand,
        ReferenceDailyTickHandler,
        PtaxAfternoonCommand,
        PtaxAfternoonTickHandler
    ]
})
export class MarketDataCommandModule {}
