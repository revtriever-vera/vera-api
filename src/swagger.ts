import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import basicAuth from 'express-basic-auth';
import { AppConfig } from './config/app.config';

export function setupSwagger(app: INestApplication, config: AppConfig): void {
    app.use(
        ['/docs', '/docs-json', '/docs-yaml'],
        basicAuth({
            users: { [config.SWAGGER_USER]: config.SWAGGER_PASSWORD },
            challenge: true
        })
    );

    const document: OpenAPIObject = SwaggerModule.createDocument(
        app,
        new DocumentBuilder()
            .setTitle('Vera API')
            .setDescription(
                'Vera API. All errors follow the problem+json shape: ' +
                    '`{ type, title, status, detail, requestId, meta? }` — `requestId` correlates with structured logs.'
            )
            .setVersion('0.1.0')
            .addBearerAuth()
            .build()
    );
    SwaggerModule.setup('docs', app, document);
}
