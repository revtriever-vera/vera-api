import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AesGcmCryptoDriver } from './aes-gcm-crypto.driver';
import { cryptoConfig } from './config/crypto.config';
import { CryptoPort } from './crypto.port';
import { HmacSha256Driver } from './hmac-sha256.driver';
import { HmacPort } from './hmac.port';

@Module({
    imports: [ConfigModule.forFeature(cryptoConfig)],
    providers: [
        { provide: CryptoPort, useClass: AesGcmCryptoDriver },
        { provide: HmacPort, useClass: HmacSha256Driver }
    ],
    exports: [CryptoPort, HmacPort]
})
export class CryptoModule {}
