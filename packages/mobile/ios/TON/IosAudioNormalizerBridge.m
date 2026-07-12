#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(IosAudioNormalizer, NSObject)

RCT_EXTERN_METHOD(normalize:(NSString *)filePath
                  targetBitRate:(nonnull NSNumber *)targetBitRate
                  operationId:(NSString *)operationId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancel:(NSString *)operationId
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
