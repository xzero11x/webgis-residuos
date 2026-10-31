import ftplib,io,zipfile,json,pathlib
# Cuenta pública de solo lectura publicada por mediaTUM en https://mediatum.ub.tum.de/1782307
# Cada lectura solicita un rango; nunca se descarga el ZIP regional completo.
from functools import lru_cache

@lru_cache(maxsize=1)
def archive_size():
 f=ftplib.FTP('dataserv.ub.tum.de',timeout=30)
 try:
  f.login('m1782307','m1782307');f.voidcmd('TYPE I')
  return f.size('Height/southamerica/w080_s05_w075_s10.zip')
 finally:f.close()

class RangeFTP(io.RawIOBase):
 def __init__(self):self.pos=0
 def seekable(self):return True
 def readable(self):return True
 def tell(self):return self.pos
 def seek(self,offset,whence=0):
  self.pos=offset if whence==0 else self.pos+offset if whence==1 else archive_size()+offset
  return self.pos
 def read(self,n=-1):
  n=min(archive_size()-self.pos, n if n>=0 else archive_size()-self.pos)
  if n>4*1024*1024:raise RuntimeError('Lectura acotada a 4 MB; no descargar el ZIP regional completo')
  if n<=0:return b''
  f=ftplib.FTP('dataserv.ub.tum.de',timeout=30);f.login('m1782307','m1782307');f.voidcmd('TYPE I')
  sock=f.transfercmd('RETR Height/southamerica/w080_s05_w075_s10.zip',rest=self.pos)
  data=bytearray()
  try:
   while len(data)<n:
    b=sock.recv(min(65536,n-len(data)))
    if not b:break
    data.extend(b)
  finally:sock.close();f.close()
  self.pos+=len(data);return bytes(data)
