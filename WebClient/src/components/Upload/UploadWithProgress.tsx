export async function uploadWithProgress(file: File, onProgress: (p: number)=>void) {
    const xhr = new XMLHttpRequest();
    const token = localStorage.getItem("token") || "";
    return await new Promise<{ id: number; url?: string }>((resolve, reject) => {
        xhr.open("POST", "/api/attachments");
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) onProgress(Math.round(ev.loaded * 100 / ev.total));
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve(JSON.parse(xhr.responseText));
            else reject(new Error(xhr.responseText));
        };
        xhr.onerror = () => reject(new Error("upload failed"));

        const form = new FormData();
        form.append("file", file);
        xhr.send(form);
    });
}
