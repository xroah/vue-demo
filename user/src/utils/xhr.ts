import serialize from "./serialize";
import isObject from "./is-object";
import noop from "./noop";

let token = 0;

export class CancelToken {
    public token: number;
    static requests: Map<number, XHR> = new Map();

    constructor() {
        this.token = token++;
    }

    cancel() {
        CancelToken.cancel(this.token);
    }

    static add(xhr: XHR) {
        if (xhr.token !== undefined) {
            this.requests.set(xhr.token, xhr);
        }
    }

    static remove(xhr: XHR) {
        const { requests } = this;

        if (xhr.token && requests.has(xhr.token)) {
            requests.delete(xhr.token);
        }
    }

    static cancel(token: number) {
        const { requests } = this;
        const xhr = requests.get(token);

        if (xhr) {
            xhr.cancelled = true;

            xhr.xhr.abort();
            this.remove(xhr);
        }
    }

    static cancelAll() {
        const { requests } = this;

        requests.forEach(v => v.xhr.abort());

        this.requests = new Map();
    }
}

interface Options {
    method?: string;
    url?: string;
    data?: any;
    responseType?: XMLHttpRequestResponseType;
    headers?: any;
    token?: number;
    withCredentials?: boolean;
    timeout?: number;
    beforeSend?: (xhr: XMLHttpRequest) => any;
    onComplete?: (xhr: XMLHttpRequest) => any;
}

interface XHROptions extends Options {
    onAbort?: (evt: ProgressEvent, xhr: XMLHttpRequest) => any;
    onTimeout?: (evt: ProgressEvent, xhr: XMLHttpRequest) => any;
    onError?: (evt: any, xhr: XMLHttpRequest) => any;
    onSuccess?: (data: any, xhr: XMLHttpRequest) => any;
}

class XHR {
    private options: XHROptions;
    private complete = true;
    public cancelled = false;
    public xhr: XMLHttpRequest = new XMLHttpRequest();
    public token: number | undefined = undefined;

    constructor(options: XHROptions) {
        this.options = options;
        this.xhr.responseType = options.responseType || "json";

        if (options.withCredentials != undefined) {
            this.xhr.withCredentials = !!options.withCredentials;
        }

        if (options.timeout != undefined) {
            this.xhr.timeout = options.timeout;
        }

        if (options.token != undefined) {
            this.token = options.token;

            CancelToken.add(this);
        }
    }

    initEvents() {
        const {
            onAbort = noop,
            onError = noop,
            onTimeout = noop,
            onSuccess = noop
        } = this.options;
        const { xhr } = this;

        xhr.onreadystatechange = evt => {
            if (xhr.readyState === 4) {
                const res = xhr.response;
                if (xhr.status === 200 && res && res.code === 0) {
                    onSuccess(res, xhr);
                } else if (!this.cancelled) {
                    onError(xhr.response, xhr);
                }

                this.handleComplete();
            }
        };
        xhr.onabort = evt => {
            onAbort(evt, xhr);
            this.handleComplete();
        };
        xhr.onerror = evt => {
            onError(evt, xhr);
        };
        xhr.ontimeout = evt => {
            onTimeout(evt, xhr);
        };
    }

    handleComplete() {
        const {
            onComplete = noop
        } = this.options;

        if (this.complete) return;

        this.complete = true;

        onComplete(this.xhr);
        CancelToken.remove(this);
    }

    request() {
        let {
            method = "GET",
            beforeSend = noop,
            headers,
            data,
            url = ""
        } = this.options;
        method = method.toUpperCase();
        const sendData = method === "POST" || method === "PUT";

        if (!isObject(headers)) {
            headers = {};
        }

        if (sendData) {
            if (isObject(data)) {
                if ((headers["Content-Type"] || "").includes("application/json")) {
                    data = JSON.stringify(data);
                } else {
                    data = serialize(data);
                }
            }
        } else {
            if (isObject(data)) {
                data = serialize(data);
            }
        }

        this.initEvents();

        if (sendData || !data) {
            this.xhr.open(method, url, true);
        } else {
            this.xhr.open(method, `${url}?${data}`, true);
        }

        beforeSend(this.xhr);

        for (let key in headers) {
            this.xhr.setRequestHeader(key, headers[key]);
        }

        this.xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
        this.xhr.send(sendData ? data : null);
    }
}

export default function xhr(url: string | Options, options: Options = {}) {
    if (typeof url === "object") {
        options = url;
    } else {
        options.url = url;
    }

    return new Promise((resolve, reject) => {
        const handleRes = (xhr: XMLHttpRequest, evt?: ProgressEvent, data?: any) => {
            return {
                data,
                error: evt ? evt.type : null,
                status: xhr.status,
                readyState: xhr.readyState,
                statusText: xhr.statusText
            };
        }
        const req = new XHR({
            ...options,
            onAbort(evt, xhr) {
                reject(handleRes(xhr, evt));
            },
            onError(evt, xhr) {
                let res;

                if (evt instanceof Event) {
                    res = handleRes(xhr, evt as any);
                } else {
                    res = handleRes(xhr, undefined, evt);
                }
                reject(res);
            },
            onTimeout(evt, xhr) {
                reject(handleRes(xhr, evt));
            },
            onSuccess(data) {
                resolve(data?.data);
            }
        });

        req.request();
    });
}