import cv2

RTSP_URL = "rtsp://admin:LABO_INDUS_40@192.168.10.119:554/Streaming/Channels/101"

cap = cv2.VideoCapture(RTSP_URL, cv2.CAP_FFMPEG)

if not cap.isOpened():
    print("Impossible d'ouvrir le flux RTSP")
    exit()

while True:
    ret, frame = cap.read()

    if not ret:
        print("Frame non reçue")
        break

    cv2.imshow("Camera RTSP", frame)

    # appuie sur q pour quitter
    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

cap.release()
cv2.destroyAllWindows()