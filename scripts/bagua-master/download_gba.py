import sys,ftplib,zipfile,zlib,json,pathlib
from gba_zip import RangeFTP
out=pathlib.Path('data/bagua-master/alturas/fuentes-adicionales')
with zipfile.ZipFile(RangeFTP()) as z:
 infos=[]
 for info in z.infolist():
  try:
   west,north,east,south=map(float,info.filename.split('_')[:4])
   if west < -78.48 and east > -78.585 and south < -5.59 and north > -5.7:infos.append(info)
  except ValueError:pass
 for info in infos:
  dest=out/info.filename
  if dest.exists() and dest.stat().st_size==info.file_size:print('Ya descargado',dest,flush=True);continue
  r=RangeFTP();r.seek(info.header_offset);h=r.read(30);import struct
  fields=struct.unpack('<4s5H3I2H',h);dataoffset=info.header_offset+30+fields[-2]+fields[-1]
  print('Descargando solo tesela:',info.filename,'bytes comprimidos',info.compress_size,flush=True)
  f=ftplib.FTP('dataserv.ub.tum.de',timeout=60);f.login('m1782307','m1782307');f.voidcmd('TYPE I');sock=f.transfercmd('RETR Height/southamerica/w080_s05_w075_s10.zip',rest=dataoffset)
  remaining=info.compress_size;inflate=zlib.decompressobj(-15);crc=0;size=0
  temp=dest.with_suffix('.partial')
  with temp.open('wb') as w:
   while remaining:
    data=sock.recv(min(1024*1024,remaining))
    if not data:raise RuntimeError('Descarga incompleta')
    remaining-=len(data);raw=inflate.decompress(data);w.write(raw);crc=zlib.crc32(raw,crc);size+=len(raw)
  sock.close();f.close()
  if crc!=info.CRC or size!=info.file_size:raise RuntimeError('CRC o tamaño incorrectos')
  temp.replace(dest);print('Verificada CRC:',dest,flush=True)
