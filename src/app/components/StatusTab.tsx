import { Plus, Camera } from 'lucide-react';
import { useApp } from '../context/AppContext';
import Avatar from './Avatar';

export default function StatusTab() {
  const { contacts, statuses, currentUser } = useApp();

  const unviewed = statuses.filter(s => !s.viewed);
  const viewed = statuses.filter(s => s.viewed);

  const getContact = (id: string) => contacts.find(c => c.id === id);

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      {/* My Status */}
      <div className="px-4 py-4 border-b border-[#2A3942]">
        <h3 className="text-[#8696A0] mb-3 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          My Status
        </h3>
        <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#2A3942] cursor-pointer transition-colors">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-[#DFE5E7] flex items-center justify-center overflow-hidden">
              {currentUser.avatar ? (
                <img src={currentUser.avatar} alt="me" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-[#DFE5E7] flex items-center justify-center">
                  <span className="text-[#8696A0]" style={{ fontSize: '1.2rem', fontWeight: 600 }}>
                    {currentUser.name ? currentUser.name[0].toUpperCase() : '?'}
                  </span>
                </div>
              )}
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-[#00A884] rounded-full flex items-center justify-center border-2 border-[#111B21]">
              <Plus size={10} className="text-white" />
            </div>
          </div>
          <div>
            <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>My status</p>
            <p className="text-[#8696A0]" style={{ fontSize: '0.8rem' }}>Tap to add status update</p>
          </div>
        </div>
      </div>

      {/* Recent Updates */}
      {unviewed.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-[#8696A0] mb-2 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Recent Updates
          </h3>
          {unviewed.map(status => {
            const contact = getContact(status.contactId);
            if (!contact) return null;
            return (
              <StatusItem key={status.id} status={status} contact={contact} />
            );
          })}
        </div>
      )}

      {/* Viewed Updates */}
      {viewed.length > 0 && (
        <div className="px-4 py-3">
          <h3 className="text-[#8696A0] mb-2 px-1" style={{ fontSize: '0.8rem', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Viewed Updates
          </h3>
          {viewed.map(status => {
            const contact = getContact(status.contactId);
            if (!contact) return null;
            return (
              <StatusItem key={status.id} status={status} contact={contact} viewed />
            );
          })}
        </div>
      )}

      {/* Camera FAB */}
      <div className="fixed bottom-20 right-4 md:hidden flex flex-col gap-3 items-end">
        <button className="w-12 h-12 rounded-full bg-[#2A3942] flex items-center justify-center shadow-lg">
          <Camera size={20} className="text-[#8696A0]" />
        </button>
        <button className="w-14 h-14 rounded-full bg-[#00A884] flex items-center justify-center shadow-lg">
          <Plus size={24} className="text-white" />
        </button>
      </div>
    </div>
  );
}

function StatusItem({ status, contact, viewed = false }: {
  status: any;
  contact: any;
  viewed?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#2A3942] cursor-pointer transition-colors">
      <div className="relative">
        {/* Status ring */}
        <div className={`w-14 h-14 rounded-full p-0.5 ${viewed ? 'bg-[#8696A0]' : 'bg-gradient-to-br from-[#00A884] to-[#34b7f1]'}`}>
          <div className="w-full h-full rounded-full p-0.5 bg-[#111B21]">
            <Avatar src={contact.avatar} name={contact.name} color={contact.avatarColor} size={48} />
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[#E9EDEF]" style={{ fontWeight: 500 }}>{contact.name}</p>
        <p className="text-[#8696A0] truncate" style={{ fontSize: '0.8rem' }}>{status.timestamp}</p>
      </div>
    </div>
  );
}
