#import <AppKit/AppKit.h>

typedef void (*DragCallback)(const char *);
static NSMutableDictionary *controllers;
static NSMutableDictionary *pending;
static NSUInteger nextToken;
static NSString *lastError;

@interface DeviceDrag : NSObject <NSFilePromiseProviderDelegate, NSDraggingSource>
@property NSArray *files;
@property NSString *identifier;
@property DragCallback callback;
@property NSOperationQueue *queue;
@end

static void Notify(DeviceDrag *owner, NSDictionary *event) {
    NSData *json = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    owner.callback([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding].UTF8String);
}

@implementation DeviceDrag
- (NSString *)filePromiseProvider:(NSFilePromiseProvider *)provider fileNameForType:(NSString *)type {
    return self.files[[provider.userInfo[@"index"] unsignedIntegerValue]][@"name"];
}
- (NSOperationQueue *)operationQueueForFilePromiseProvider:(NSFilePromiseProvider *)provider {
    return self.queue;
}
- (void)filePromiseProvider:(NSFilePromiseProvider *)provider writePromiseToURL:(NSURL *)url completionHandler:(void (^)(NSError *))completion {
    dispatch_async(dispatch_get_main_queue(), ^{
        NSString *token = [NSString stringWithFormat:@"%lu", (unsigned long)++nextToken];
        pending[token] = @{@"completion": [completion copy], @"owner": self};
        Notify(self, @{@"event": @"write", @"drag": self.identifier, @"token": token,
                       @"index": provider.userInfo[@"index"], @"destination": url.path});
    });
}
- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context {
    return NSDragOperationCopy;
}
- (BOOL)ignoreModifierKeysForDraggingSession:(NSDraggingSession *)session { return YES; }
- (void)draggingSession:(NSDraggingSession *)session endedAtPoint:(NSPoint)point operation:(NSDragOperation)operation {
    Notify(self, @{@"event": @"end", @"drag": self.identifier, @"copied": @(operation != NSDragOperationNone)});
    // Promises can be requested after the mouse is released. Pending operations retain their owner.
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 60 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
        [controllers removeObjectForKey:self.identifier];
    });
}
@end

static DeviceDrag *CreateOwner(const char *json, DragCallback callback) {
    if (!controllers) controllers = [NSMutableDictionary dictionary];
    if (!pending) pending = [NSMutableDictionary dictionary];
    NSDictionary *config = [NSJSONSerialization JSONObjectWithData:[[NSString stringWithUTF8String:json] dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
    DeviceDrag *owner = [DeviceDrag new];
    owner.files = config[@"files"];
    owner.identifier = config[@"id"];
    owner.callback = callback;
    owner.queue = [NSOperationQueue new];
    owner.queue.maxConcurrentOperationCount = 1;
    controllers[owner.identifier] = owner;
    return owner;
}

static NSFilePromiseProvider *Provider(DeviceDrag *owner, NSUInteger index) {
    NSString *type = [owner.files[index][@"isFolder"] boolValue] ? @"public.folder" : @"public.data";
    NSFilePromiseProvider *provider = [[NSFilePromiseProvider alloc] initWithFileType:type delegate:owner];
    provider.userInfo = @{@"index": @(index), @"owner": owner};
    return provider;
}

const char *BeginDeviceDrag(void *handle, const char *json, DragCallback callback) {
    @try {
        if (![NSThread isMainThread] || !([NSEvent pressedMouseButtons] & 1)) return "请按住鼠标拖动文件";
        NSView *view = (__bridge NSView *)handle;
        NSWindow *window = view.window;
        if (!window) return "无法找到文件窗口";
        DeviceDrag *owner = CreateOwner(json, callback);
        NSMutableArray *items = [NSMutableArray array];
        NSPoint location = [window mouseLocationOutsideOfEventStream];
        NSPoint point = [view convertPoint:location fromView:nil];
        for (NSUInteger index = 0; index < owner.files.count; index++) {
            NSDraggingItem *item = [[NSDraggingItem alloc] initWithPasteboardWriter:Provider(owner, index)];
            NSImage *icon = [[NSWorkspace sharedWorkspace] iconForFileType:[owner.files[index][@"isFolder"] boolValue] ? @"public.folder" : [owner.files[index][@"name"] pathExtension]];
            [item setDraggingFrame:NSMakeRect(point.x - 16, point.y - 16, 32, 32) contents:icon];
            [items addObject:item];
        }
        NSEvent *event = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDragged location:location modifierFlags:0 timestamp:NSProcessInfo.processInfo.systemUptime windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1];
        NSDraggingSession *session = [view beginDraggingSessionWithItems:items event:event source:owner];
        session.animatesToStartingPositionsOnCancelOrFail = YES;
        return NULL;
    } @catch (NSException *exception) {
        lastError = exception.reason;
        return lastError.UTF8String;
    }
}

void CompleteDevicePromise(const char *tokenValue, const char *errorValue) {
    NSString *token = [NSString stringWithUTF8String:tokenValue];
    NSDictionary *entry = pending[token];
    if (!entry) return;
    void (^completion)(NSError *) = entry[@"completion"];
    NSError *error = errorValue && strlen(errorValue) ? [NSError errorWithDomain:@"OpenMTP" code:1 userInfo:@{NSLocalizedDescriptionKey: [NSString stringWithUTF8String:errorValue]}] : nil;
    completion(error);
    [pending removeObjectForKey:token];
}

// Exercise the same delegate, completion blocks and delivery code without mouse injection.
// Finder itself populates the pasteboard metadata during an actual dragging session.
void TestDevicePromise(const char *json, const char *directory, DragCallback callback) {
    DeviceDrag *owner = CreateOwner(json, callback);
    NSURL *parent = [NSURL fileURLWithPath:[NSString stringWithUTF8String:directory] isDirectory:YES];
    __block NSUInteger remaining = owner.files.count;
    NSMutableArray *results = [NSMutableArray array];
    for (NSUInteger index = 0; index < owner.files.count; index++) {
        NSFilePromiseProvider *provider = Provider(owner, index);
        NSString *filename = [owner filePromiseProvider:provider fileNameForType:provider.fileType];
        NSURL *target = [parent URLByAppendingPathComponent:filename];
        [owner filePromiseProvider:provider writePromiseToURL:target completionHandler:^(NSError *error) {
            [results addObject:@{@"destination": target.path, @"error": error.localizedDescription ?: @""}];
            if (--remaining == 0) {
                Notify(owner, @{@"event": @"received", @"drag": owner.identifier, @"results": results});
                [controllers removeObjectForKey:owner.identifier];
            }
        }];
    }
}
