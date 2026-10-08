#import <Foundation/Foundation.h>
#import <ImageCaptureCore/ImageCaptureCore.h>

static void Emit(NSDictionary *value) {
    NSData *data=[NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
    @synchronized(NSFileHandle.fileHandleWithStandardOutput) {
        fwrite(data.bytes,1,data.length,stdout); fputc('\n',stdout); fflush(stdout);
    }
}
// ImageCaptureCore omits leading zeroes from the second UDID component on some iPhones.
// Normalize components rather than matching by display name or selecting the first camera.
static NSString *Identity(NSString *serial) {
    NSArray *parts=[serial.lowercaseString componentsSeparatedByString:@"-"];
    if(parts.count==2 && [parts[0] length]==8 && [parts[1] length]<=16) {
        NSString *tail=parts[1];
        while(tail.length<16) tail=[@"0" stringByAppendingString:tail];
        return [parts[0] stringByAppendingString:tail];
    }
    return serial.lowercaseString;
}
@interface Photos : NSObject <ICDeviceBrowserDelegate,ICCameraDeviceDelegate>
@property ICDeviceBrowser *browser;
@property ICCameraDevice *camera;
@property NSString *serial;
@property NSString *generation;
@property NSMapTable<ICCameraFile*,NSString*> *identifiers;
@property NSMutableDictionary<NSString*,ICCameraFile*> *files;
@property NSMutableArray *waiting;
@property BOOL ready;
@property NSUInteger openAttempts;
@end
@implementation Photos
- (void)reply:(NSDictionary*)r data:(id)data error:(NSString*)error {
    Emit(@{@"id":r[@"id"] ?: @"",@"data":data ?: NSNull.null,@"error":error ?: NSNull.null});
}
- (NSString*)key:(ICCameraFile*)f {
    // PTP handles can be zero, and names repeat across DCIM folders. Neither is a unique key.
    NSString *identifier=[self.identifiers objectForKey:f];
    if(!identifier) { identifier=NSUUID.UUID.UUIDString; [self.identifiers setObject:identifier forKey:f]; }
    return [NSString stringWithFormat:@"/@photos/%@/%@",identifier,f.name];
}
- (void)request:(NSDictionary*)r {
    if(!self.ready) { [self.waiting addObject:r]; return; }
    NSString *op=r[@"operation"];
    if([op isEqual:@"listFiles"]) {
        [self.files removeAllObjects]; NSMutableArray *rows=[NSMutableArray array];
        NSISO8601DateFormatter *format=[NSISO8601DateFormatter new];
        for(ICCameraItem *item in self.camera.mediaFiles) {
            if(![item isKindOfClass:ICCameraFile.class] || !item.name.length || [item.name containsString:@"/"]) continue;
            ICCameraFile *f=(ICCameraFile*)item; NSString *key=[self key:f]; self.files[key]=f;
            [rows addObject:@{@"path":key,@"name":f.name,@"size":@(f.fileSize),@"isFolder":@NO,@"isPhoto":@YES,@"dateAdded":[format stringFromDate:f.creationDate ?: NSDate.distantPast]}];
        }
        [self reply:r data:rows error:nil]; return;
    }
    ICCameraFile *f=self.files[r[@"filePath"] ?: @""];
    if(!f) { [self reply:r data:nil error:@"照片列表已变化，请刷新后重试"]; return; }
    if([op isEqual:@"thumbnail"]) {
        [f requestThumbnailDataWithOptions:@{@"kCGImageSourceThumbnailMaxPixelSize":@256} completion:^(NSData *data,NSError *e) {
            [self reply:r data:data ? [@"data:image/jpeg;base64," stringByAppendingString:[data base64EncodedStringWithOptions:0]] : nil error:e.localizedDescription];
        }];
    } else if([op isEqual:@"download"]) {
        NSDictionary *options=@{ICDownloadsDirectoryURL:[NSURL fileURLWithPath:r[@"destination"] isDirectory:YES],ICSaveAsFilename:f.name,ICOverwrite:@NO,ICDeleteAfterSuccessfulDownload:@NO};
        __block NSTimer *timer;
        NSProgress *progress=[f requestDownloadWithOptions:options completion:^(NSString *filename,NSError *error) {
            dispatch_async(dispatch_get_main_queue(),^{[timer invalidate]; [self reply:r data:filename error:error.localizedDescription];});
        }];
        timer=[NSTimer scheduledTimerWithTimeInterval:0.5 repeats:YES block:^(NSTimer *t) { Emit(@{@"id":r[@"id"],@"progress":@(progress.fractionCompleted)}); }];
    } else [self reply:r data:nil error:@"照片仅支持浏览和导出到 Mac"];
}
- (void)deviceBrowser:(ICDeviceBrowser*)b didAddDevice:(ICDevice*)d moreComing:(BOOL)m {
    if(!self.camera && [d isKindOfClass:ICCameraDevice.class] && [Identity(d.serialNumberString) isEqual:Identity(self.serial)]) { self.camera=(ICCameraDevice*)d; d.delegate=self; self.openAttempts=1; [d requestOpenSession]; }
}
- (void)deviceBrowser:(ICDeviceBrowser*)b didRemoveDevice:(ICDevice*)d moreGoing:(BOOL)m { if(d==self.camera) exit(2); }
- (void)didRemoveDevice:(ICDevice*)d { if(d==self.camera) exit(2); }
- (void)device:(ICDevice*)d didOpenSessionWithError:(NSError*)e {
    if(d!=self.camera || !e || self.ready) return;
    if(self.openAttempts<2) {
        self.openAttempts++;
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(NSEC_PER_SEC)),dispatch_get_main_queue(),^{
            if(!self.ready && self.camera==d) [d requestOpenSession];
        });
    } else {
        NSArray *pending=[self.waiting copy]; [self.waiting removeAllObjects];
        for(NSDictionary *r in pending) [self reply:r data:nil error:[NSString stringWithFormat:@"无法打开 iPhone 照片会话：%@",e.localizedDescription]];
    }
}
- (void)device:(ICDevice*)d didCloseSessionWithError:(NSError*)e { if(d==self.camera) exit(2); }
- (void)deviceDidBecomeReadyWithCompleteContentCatalog:(ICCameraDevice*)d {
    self.ready=YES; NSArray *pending=[self.waiting copy]; [self.waiting removeAllObjects]; for(NSDictionary *r in pending) [self request:r];
}
- (void)cameraDevice:(ICCameraDevice*)d didAddItems:(NSArray*)items {}
- (void)cameraDevice:(ICCameraDevice*)d didRemoveItems:(NSArray*)items { for(ICCameraFile *f in items) if([f isKindOfClass:ICCameraFile.class]) [self.files removeObjectForKey:[self key:f]]; }
- (void)cameraDevice:(ICCameraDevice*)d didReceiveThumbnail:(CGImageRef)t forItem:(ICCameraItem*)i error:(NSError*)e {}
- (void)cameraDevice:(ICCameraDevice*)d didReceiveMetadata:(NSDictionary*)m forItem:(ICCameraItem*)i error:(NSError*)e {}
- (void)cameraDevice:(ICCameraDevice*)d didRenameItems:(NSArray*)i {}
- (void)cameraDeviceDidChangeCapability:(ICCameraDevice*)d {}
- (void)cameraDevice:(ICCameraDevice*)d didReceivePTPEvent:(NSData*)e {}
- (void)cameraDeviceDidRemoveAccessRestriction:(ICDevice*)d {}
- (void)cameraDeviceDidEnableAccessRestriction:(ICDevice*)d {}
@end
int main(int argc,const char *argv[]) {
    @autoreleasepool {
        if(argc!=2) return 1;
        Photos *photos=[Photos new]; photos.serial=@(argv[1]); photos.generation=NSUUID.UUID.UUIDString;
        photos.identifiers=[NSMapTable mapTableWithKeyOptions:NSPointerFunctionsStrongMemory|NSPointerFunctionsObjectPointerPersonality valueOptions:NSPointerFunctionsStrongMemory];
        photos.files=[NSMutableDictionary new]; photos.waiting=[NSMutableArray new];
        photos.browser=[ICDeviceBrowser new]; photos.browser.delegate=photos;
        photos.browser.browsedDeviceTypeMask=ICDeviceTypeMaskCamera|ICDeviceLocationTypeMaskLocal;
        [photos.browser start];
        dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED,0),^{
            char *line=NULL; size_t capacity=0; ssize_t length;
            while((length=getline(&line,&capacity,stdin))>0) {
                @autoreleasepool {
                    NSDictionary *r=[NSJSONSerialization JSONObjectWithData:[NSData dataWithBytes:line length:length] options:0 error:nil];
                    if([r isKindOfClass:NSDictionary.class]) dispatch_async(dispatch_get_main_queue(),^{[photos request:r];});
                }
            }
            free(line); exit(0);
        });
        [[NSRunLoop currentRunLoop]run];
    }
    return 0;
}
