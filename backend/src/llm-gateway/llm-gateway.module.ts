import { Module } from '@nestjs/common';
import { LLM_PROVIDER } from './llm-provider.interface';
import { MockLlmProvider } from './mock-llm.provider';

// LLM Gateway: encapsula la comunicación con el proveedor de IA para que éste
// pueda cambiarse sin afectar el resto del sistema. Por defecto (LLM_PROVIDER=mock
// en .env) usa MockLlmProvider. Para conectar un proveedor real, crea una clase
// que implemente LlmProvider (ver llm-provider.interface.ts) y regístrala aquí
// según la variable de entorno LLM_PROVIDER.
@Module({
  providers: [
    {
      provide: LLM_PROVIDER,
      useClass: MockLlmProvider,
    },
  ],
  exports: [LLM_PROVIDER],
})
export class LlmGatewayModule {}
